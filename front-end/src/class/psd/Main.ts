import { IPsdFile } from "@allType";
import axios from "axios";

export default class MainPsd {
  protected file: IPsdFile | undefined;
  protected files: IPsdFile[];

  constructor(public im_forceRender: () => void) {
    this.file = undefined;
    this.files = [];
  }

  get pt_file() {
    return this.file;
  }

  get pt_files() {
    return this.files;
  }

  async im_getFiles() {
    axios
      .post("/psd/get")
      .then((res) => {
        this.files = res.data;
        this.im_forceRender();
      })
      .catch((err) => {
        console.error(err);
      });
  }

  async im_getFile(id: number) {
    await axios
      .post("/psd/getById", { id })
      .then((res) => {
        this.file = res.data[0];
        this.im_forceRender();
      })
      .catch((err) => {
        console.error(err);
      });
  }
}
