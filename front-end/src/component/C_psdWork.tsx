import React, { useEffect, useRef, useState } from "react";
import { Canvas, Image, PencilBrush } from "fabric";
import "./PsdEditor.scss";
import { Main } from "@jsLib/class/Main_class";

class PsdEditorClass extends Main{
    constructor(){
        super();
    }
}

export default function PsdEditor(){
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas>();
  const psdImageUrl = "./data/1753250438874_BBB_001_009.psd"
  const [lv_Obj] = useState(()=>{
    return new PsdEditorClass();
  })

  lv_Obj.im_Prepare_Hooks(async ()=>{
    if (!canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
    });
    fabricRef.current = canvas;
    const img = await Image.fromURL(
      psdImageUrl,
      { crossOrigin: "anonymous" },
      { left: 0, top: 0 }
    );

    canvas.add(img);    
  })



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
  );
};

