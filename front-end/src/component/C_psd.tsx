import { Main } from "@jsLib/class/Main_class";
import Psd from "@jsLib/class/psd/Main";
import React from "react";
import { useState } from "react";
import C_psdList from "./C_psdList";
import C_psdUploadForm from "./C_psdUploadForm";

export class PsdMain extends Main {
  public psd = new Psd(this.im_forceRender.bind(this));
  constructor() {
    super();
  }
}

export default function C_psd() {
  const [lv_Obj] = useState(() => {
    return new PsdMain();
  });

  lv_Obj.im_Prepare_Hooks(()=>{
    lv_Obj.psd.im_getFiles();
  })

  return (
    <>
      <C_psdUploadForm lv_Obj={lv_Obj.psd} />
      <C_psdList lv_Obj={lv_Obj.psd} />
    </>
  );
}
