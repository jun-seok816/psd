import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import "ag-psd/initialize-canvas"; // ★ node-canvas 연결
import { BezierKnot, BezierPath, Layer, readPsd } from "ag-psd";
import type { Pool } from "mysql2/promise";
const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, "../../../", "data"));
  },
  filename: (_req, file, cb) => {
    const unique = Date.now() + "_" + file.originalname;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith(".psd")) cb(null, true);
    else cb(new Error("PSD 파일만 업로드할 수 있습니다."));
  },
});

router.post(
  "/upload",
  upload.array("psd", 40),
  async (req: Request, res: Response) => {
    /* ── 1) 로그인 확인 ───────────────────────────── */
    // const userId = req.session?.userId as number | undefined;
    // if (!userId) {
    //   res.status(401).json({ message: "로그인 필요" });
    //   return;
    // }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ message: "파일이 첨부되지 않았습니다." });
      return;
    }

    const conn = await process._myApp.db.promise().getConnection();
    try {
      await conn.beginTransaction();

      /* ── 2) psd_req에 사용자 ID 포함 INSERT ─────── */
      const [reqResult] = await conn.execute(
        `INSERT INTO psd_req (user_id, comment)
           VALUES (?, ?)`,
        [null, req.body.comment ?? null]
      );
      const reqId = (reqResult as any).insertId as number;

      /* ── 3) psd_files 일괄 INSERT ──────────────── */
      const values = files.map((f) => [
        reqId,
        f.originalname,
        f.filename,
        f.size,
        f.mimetype,
        f.path,
      ]);

      await conn.query(
        `INSERT INTO psd_files
           (req_id, original_name, stored_name, size_bytes, mime_type, path)
           VALUES ?`,
        [values]
      );

      await conn.commit();
      res.status(201).json({ reqId, uploaded: files.length });
    } catch (err) {
      await conn.rollback();
      console.error(err);
      res.status(500).json({ message: "서버 오류" });
    } finally {
      conn.release();
    }
  }
);

interface Options {
  fileRow: { id: number; stored_name: string; path: string };
  pool: Pool;
}

/** PSD → 각 레이어 PNG/SVG + DB INSERT */
export async function parsePsd({ fileRow, pool }: Options) {
  const buf = await fs.promises.readFile(fileRow.path);
  const psd = readPsd(buf); // 구조+픽셀 모두 읽기

  // 저장 폴더: /uploads/123_layers/
  const layerDir = path.join(
    path.dirname(fileRow.path),
    `${fileRow.id}_layers`
  );
  await fs.promises.mkdir(layerDir, { recursive: true });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // children 은 상단(0)이 최상위 레이어
    for (let idx = 0; idx < (psd.children?.length ?? 0); idx++) {
      const layer = psd.children![idx];
      const safeName = layer.name?.replace(/[^\w.-]+/g, "_") || `layer_${idx}`;

      /* ── 1) 비트맵 레이어 ───────────────────────── */
      if (layer.canvas) {
        const filename = `${idx}_${safeName}.png`;
        const outPath = path.join(layerDir, filename);
        // node-canvas toBuffer()
        await fs.promises.writeFile(outPath, (layer.canvas as any).toBuffer());
        await insertLayer(conn, {
          file_id: fileRow.id,
          idx,
          name: layer.name,
          type: "bitmap",
          path: outPath,
          text: null,
        });
        continue;
      }

      /* ── 2) 텍스트 레이어 ──────────────────────── */
      if (layer.text) {
        await insertLayer(conn, {
          file_id: fileRow.id,
          idx,
          name: layer.name,
          type: "text",
          path: null,
          text: layer.text.text, // 실제 문자열
        });
        continue;
      }

      /* ── 3) 벡터·Shape ────────────────────────── */
      if (layer.vectorMask) {
        const svgName = `${idx}_${safeName}.svg`;
        const svgPath = path.join(layerDir, svgName);
        // 벡터-마스크를 SVG path d 속성으로 변환하는 유틸은 별도 구현 필요
        const svgMarkup = vectorMaskToSvg(layer); // TODO
        await fs.promises.writeFile(svgPath, svgMarkup);
        await insertLayer(conn, {
          file_id: fileRow.id,
          idx,
          name: layer.name,
          type: "vector",
          path: svgPath,
          text: null,
        });
      }
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export function vectorMaskToSvg(
  layer: Layer,
  opts: { stroke?: string; fill?: string; strokeWidth?: number } = {}
): string {
  const { vectorMask, left = 0, top = 0, right = 0, bottom = 0 } = layer;
  if (!vectorMask?.paths?.length) return "";

  const w = Math.round(right - left);
  const h = Math.round(bottom - top);
  const toPx = ([x, y]: [number, number]) =>
    `${(x * w).toFixed(2)} ${(y * h).toFixed(2)}`;

  const { stroke = "#000", fill = "none", strokeWidth = 1 } = opts;

  /* 패스별 <path d="…"> 만들기 ----------------------------------------- */
  const pathEls = vectorMask.paths.map((bp: BezierPath) => {
    const d: string[] = [];
    const knots = bp.knots as BezierKnot[];

    knots.forEach((k, idx) => {
      const [inX, inY, ax, ay, outX, outY] = k.points;
      if (idx === 0) {
        d.push(`M ${toPx([ax, ay])}`);
      } else {
        const prev = knots[idx - 1].points;
        const isLine =
          prev[4] === prev[2] &&
          prev[5] === prev[3] &&
          inX === ax &&
          inY === ay;

        d.push(
          isLine
            ? `L ${toPx([ax, ay])}`
            : `C ${toPx([prev[4], prev[5]])} ${toPx([inX, inY])} ${toPx([
                ax,
                ay,
              ])}`
        );
      }
    });

    if (!bp.open) d.push("Z");

    /* 개별 fill-rule 적용 */
    return `<path d="${d.join(" ")}"
                   fill="${fill}"
                   stroke="${stroke}"
                   stroke-width="${strokeWidth}"
                   fill-rule="${bp.fillRule}"/>`;
  });

  /* SVG 래퍼 ----------------------------------------------------------- */
  return `<svg xmlns="http://www.w3.org/2000/svg"
               width="${w}" height="${h}"
               viewBox="0 0 ${w} ${h}">
            ${pathEls.join("\n")}
          </svg>`;
}

async function insertLayer(conn: any, row: Record<string, any>) {
  await conn.query(
    `INSERT INTO psd_layers
       (file_id, idx, name, type, path, text)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.file_id, row.idx, row.name, row.type, row.path, row.text]
  );
}

export default router;
