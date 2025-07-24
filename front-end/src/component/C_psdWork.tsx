import React, { useEffect, useRef, useState } from "react";
import {
  Canvas,
  FabricImage,
  FabricObject,
  Group,
  Image,
  loadSVGFromURL,
  PencilBrush,
  Point,
  Textbox,
} from "fabric";
import "./C_psdWork.scss";
import { Main } from "@jsLib/class/Main_class";
import C_psdUploadForm from "./C_psdUploadForm";
import Psd from "@jsLib/class/psd/Main";
import { LayerNode } from "@allType";

class PsdEditorClass extends Main {
  public psd = new Psd(this.im_forceRender.bind(this));
  constructor() {
    super();
  }
}

export async function loadSvgGroup(url: string): Promise<Group> {
  // { objects } 구조분해 – parseSVGDocument 의 반환값
  const { objects } = await loadSVGFromURL(
    url,
    /* reviver = */ undefined,
    /* options  = */ { crossOrigin: "anonymous" }
  );

  // objects 는 FabricObject[] 타입
  return new Group(objects as FabricObject[], { selectable: false });
}

const lv_urlParameter = window.location.search;
const lv_searchParams = new URLSearchParams(lv_urlParameter);

// assets 가 저장된 베이스 URL (예: `/uploads/5_assets/`)
const ASSET_BASE = `${window.origin}/data/${lv_searchParams.get("id")}_assets/`;

async function mountLayers(
  canvas: Canvas,
  layers: LayerNode[],
  parentGroup?: Group // 재귀용
) {
  for (const node of layers) {
    let obj;

    /* ── 그룹(폴더) ───────────────────────────── */
    if (node.type === "group") {
      obj = new Group([], { selectable: false });
      obj.set("name", node.name);
      if (node.children?.length) {
        await mountLayers(canvas, node.children, obj);
      }
    } else if (node.type === "bitmap" && node.path) {
      /* ── 비트맵 ───────────────────────────────── */
      obj = await FabricImage.fromURL(`${ASSET_BASE}${node.path}`, {
        crossOrigin: "anonymous",
      });
    } else if (node.type === "vector" && node.path) {
      const group = await loadSvgGroup(`${ASSET_BASE}${node.path}`);

      // 메타데이터는 data 속성에
      group.set({ data: { id: node.id, name: node.name } });

      parentGroup ? parentGroup.add(group) : canvas.add(group);
    } else if (node.type === "text" && node.text) {
      /* ── 텍스트 ──────────────────────────────── */
      obj = new Textbox(node.text.content, {
        ...node.text.style,
        editable: false,
        textAlign: "center",
      });
    }

    /* ── 공통: 이름, id 부여 ──────────────────── */
    if (obj) {
      obj.set({ dataId: node.id, layerName: node.name });

      // 그룹 안에서 호출됐으면 그룹에 add, 아니면 캔버스에 add
      parentGroup ? parentGroup.add(obj) : canvas.add(obj);
    }
  }

  // 그룹 루트일 경우 캔버스에 최종 add
  if (parentGroup && !parentGroup.group) canvas.add(parentGroup);
}

export default function PsdEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas>();
  const [PsdEditor] = useState(() => {
    return new PsdEditorClass();
  });

  PsdEditor.im_Prepare_Hooks(async () => {});

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      backgroundColor: "#000000",
      preserveObjectStacking: true,
    });
    fabricRef.current = canvas;

    const fileId = Number(lv_searchParams.get("id"));

    PsdEditor.psd.im_getFile(fileId).then(async () => {
      const file = PsdEditor.psd.pt_file;

      if (!file || !file.layers_json) return;

      const layerJson = file.layers_json;

      // 레이어 트리 mount 후 canvas 갱신
      await mountLayers(canvas, layerJson);
      // 1) Fit-scale (가로 기준)
      const bg = canvas.item(0) as Image; // 첫 번째가 전체 PSD 미리보기
      const scale = canvas.getWidth() / bg.width!;

      // 2) 줌 기준점은 (0,0)
      canvas.zoomToPoint(new Point(0, 0), scale);

      // 3) scale 적용 뒤, 음수 left/top 만큼 이동해서 (0,0)에 맞춘다
      canvas.relativePan(new Point(-bg.left! * scale, -bg.top! * scale));

      console.log("objects", canvas.getObjects().length); // ✅ 0 보다 큼
      console.log("vt", canvas.viewportTransform); // ✅ [s,0,0,s,dx,dy]

      canvas.requestRenderAll();
    });

    return () => {
      canvas.dispose();
    };
  }, []);

  /* 툴 제어 --------------------------------------------------------------- */
  const handleTool = (tool: "move" | "brush" | "undo") => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    switch (tool) {
      case "move":
        canvas.isDrawingMode = false;
        canvas.selection = true;
        break;
      case "brush":
        canvas.freeDrawingBrush = new PencilBrush(canvas);
        canvas.isDrawingMode = true;
        break;
      case "undo":
        // TODO: undoStack 구현
        break;
    }
  };

  return (
    <>
      <div className="psd-editor">
        {/* ── 상단 헤더 ─────────────────────────────────── */}
        <header className="psd-header">
          <span className="logo">PSD Editor</span>
          <button>저장</button>
        </header>

        {/* ── 좌측 툴바 ────────────────────────────────── */}
        <nav className="psd-toolbar">
          <button onClick={() => handleTool("move")} title="Move (V)">
            🔀
          </button>
          <button onClick={() => handleTool("brush")} title="Brush (B)">
            🖌️
          </button>
          <button onClick={() => handleTool("undo")} title="Undo">
            ↩️
          </button>
        </nav>

        {/* ── 중앙 캔버스 ──────────────────────────────── */}
        <section className="psd-canvas">
          <canvas ref={canvasRef} width={1200} height={800} />
        </section>

        {/* ── 우측 레이어 패널 ─────────────────────────── */}
        <aside className="psd-layers">
          <h3>Layers</h3>
          {/* TODO: 레이어 목록 동기화 */}
        </aside>
      </div>
    </>
  );
}
