import React, { useRef, useState } from "react";
import "./C_psdUploadForm.scss";

const MAX_SIZE_MB = 500;

export default function C_psdUploadForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const files = Array.from(fileRef.current?.files ?? []);

    if (files.length === 0) {
      setError("PSD 파일을 선택해주세요.");
      return;
    }

    // 용량 초과 파일 탐색
    const oversize = files.find((f) => f.size > MAX_SIZE_MB * 1024 * 1024);
    if (oversize) {
      setError(`"${oversize.name}" 파일이 ${MAX_SIZE_MB} MB 를 초과했습니다.`);
      return;
    }

    const formData = new FormData();
    files.forEach((f) => formData.append("psd", f)); // 동일 field name에 여러 파일 추가

    try {
      const res = await fetch("/psd/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`서버 오류: ${res.statusText}`);
      alert("모든 파일 업로드 완료!");
      fileRef.current!.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  };

  return (
    <form className="psd-form" onSubmit={handleSubmit}>
      <label className="psd-label">
        PSD 파일 선택 (다중)
        <input
          ref={fileRef}
          type="file"
          accept=".psd"
          multiple /* ← 추가 */
          className="psd-input"
        />
      </label>

      {error && <p className="psd-error">{error}</p>}

      <button type="submit" className="psd-button">
        업로드
      </button>
    </form>
  );
}
