import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./C_psdList.scss"; // ← module 아님!
import Psd from "@jsLib/class/psd/Main";

const byteFmt = (b: number) =>
  b < 1024
    ? `${b} B`
    : b < 1_048_576
    ? `${(b / 1024).toFixed(1)} KB`
    : `${(b / 1_048_576).toFixed(1)} MB`;

export default function PsdListView(props: { lv_Obj: Psd }) {
  const files = props.lv_Obj.pt_files;
  const nav = useNavigate();

  return (
    <section className="psd-wrapper">
      {files.length === 0 ? (
        <p className="psd-state">업로드한 파일이 없습니다.</p>
      ) : (
        <table className="psd-table">
          <thead>
            <tr>
              <th>이름</th>
              <th className="sz">크기</th>
              <th className="type">MIME</th>
              <th className="date">업로드</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr
                key={f.id}
                onClick={() => nav(`/PsdEditor?id=${f.id}`)}
                title="클릭하여 편집"
              >
                <td>{f.original_name}</td>
                <td className="sz">{byteFmt(f.size_bytes)}</td>
                <td className="type">{f.mime_type}</td>
                <td className="date">
                  {new Date(f.uploaded_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
