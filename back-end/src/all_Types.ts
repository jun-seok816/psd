export interface IPsdReq {
  id: number;
  user_id: number | null;
  comment: string | null;
  created_at: string; // MySQL DATETIME → string (ISO or 'YYYY-MM-DD HH:mm:ss')
}
export interface IPsdFile {
  id: number;
  req_id: number;
  original_name: string;
  stored_name: string;
  size_bytes: number;
  mime_type: string;
  layers_json:LayerNode[];
  path: string;
  uploaded_at: string; // MySQL DATETIME → string
}
export type PsdLayerType = 'group' | 'bitmap' | 'vector' | 'text';


export interface LayerNode {
  id: number;
  name?: string;
  type: PsdLayerType;
  path?: string;                   // bitmap, vector
  text?: { content: string; style: any };
  children?: LayerNode[];
}