import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import "ag-psd/initialize-canvas"; // ★ node-canvas 연결
import { BezierKnot, BezierPath, Layer, readPsd } from "ag-psd";
import { OkPacket, Pool, RowDataPacket, PoolConnection } from "mysql2/promise";
import { IPsdFile } from "@jsLib/all_Types";
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

      const [psd_files] = await conn.query<OkPacket>(
        `INSERT INTO psd_files
           (req_id, original_name, stored_name, size_bytes, mime_type, path)
           VALUES ?`,
        [values]
      );

      const [file_Row] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM psd_files WHERE id = ?`,
        [psd_files.insertId]
      );

      const fileRow = file_Row as IPsdFile[];

      await parsePsd({
        fileRow: fileRow[0], 
        conn:conn       
      });

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
  fileRow: IPsdFile;  
  conn:PoolConnection
}

export async function parsePsd({ fileRow , conn}: Options) {
  /* 1) PSD 읽기 */
  const buf = await fs.promises.readFile(fileRow.path);
  const psd = readPsd(buf);

  const assetDir = path.join(
    path.dirname(fileRow.path),
    `${fileRow.id}_assets`
  );
  await fs.promises.mkdir(assetDir, { recursive: true });

  /* 2) 트리 순회 → PNG / SVG 추출 & JSON 변환 */
  let autoIdx = 0;
  function convert(layer: any): any {
    const node: any = {
      id: layer.id ?? ++autoIdx,
      name: layer.name,
      type: "bitmap",
    };

    if (layer.children?.length) {
      node.type = "group";
      node.children = layer.children.map(convert);
    } else if (layer.text) {
      node.type = "text";
      node.text = {
        content: layer.text.text,
        style: layer.text.style,
      };
    } else if (layer.vectorMask) {
      node.type = "vector";
      const svg = vectorMaskToSvg(layer);
      const fname = `${node.id}.svg`;
      fs.writeFileSync(path.join(assetDir, fname), svg);
      node.path = fname;
    } else if (layer.canvas) {
      node.type = "bitmap";
      const fname = `${node.id}.png`;
      fs.writeFileSync(path.join(assetDir, fname), layer.canvas.toBuffer());
      node.path = fname;
    }

    return node;
  }

  /* 최상위 children 배열 변환 */
  const layersJSON = await Promise.all(psd.children!.map(convert));

  await conn.query("UPDATE psd_files SET layers_json = ? WHERE id = ?", [
    JSON.stringify(layersJSON),
    fileRow.id,
  ]);
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

router.post("/get",async(req,res)=>{
  try{
    const [file_Row] = await process._myApp.db.promise().query<RowDataPacket[]>(
      `SELECT * FROM psd_files`,      
    );
    res.send(file_Row);
  }catch(err){
    res.status(400).send({err:true})
  }
})

router.post("/getById",async(req,res)=>{
  try{
    const [file_Row] = await process._myApp.db.promise().query<RowDataPacket[]>(
      `SELECT * FROM psd_files WHERE id = ?`,[req.body.id]      
    );

    res.send(file_Row);
  }catch(err){
    res.status(400).send({err:true})
  }
})

export default router;
