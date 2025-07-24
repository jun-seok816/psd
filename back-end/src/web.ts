import express, { Request, Response, NextFunction } from "express";
const app = express();
import bodyParser from "body-parser";
import path from "path";
import mysql, { Connection,Pool } from "mysql2";
import session from "express-session";
var MySQLStore = require("express-mysql-session")(session);
import cookieParser from "cookie-parser";
import dotenv from 'dotenv';
import Db from "./db";

const lv_Db = new Db();
// .env 파일에서 환경 변수 로드
dotenv.config();

declare global {
  namespace NodeJS {
    interface Process {
      _myApp: MyApp;
    }
  }

  interface MyApp {        
    db: Pool;    
    checkSession:(req: Request, res: Response, next: NextFunction)=>void;        
  }
}

const gf_cs = (req: Request, res: Response, next: NextFunction)=>{
  if (!req.session || !req.session.userId) {
   res.status(401).send('Unauthorized: No session available');
 } else {
   next();
 }
}

declare module "express-session" {
  export interface SessionData {
    userId: number;    
    email:string;         
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    session: session.Session & Partial<session.SessionData>;
  }
}

process._myApp = {
  db:mysql.createPool(lv_Db.pt_Data.DB),
  checkSession:gf_cs
}

//https://expressjs.com/ko/starter/static-files.html s
app.set("puplic", path.join(__dirname, "../build"));
app.use(express.static(app.settings.puplic));
//https://www.npmjs.com/package/body-parser
app.use(bodyParser.json({ limit: "100mb" }));
app.use(bodyParser.urlencoded({ limit: "100mb", extended: false }));



app.use(cookieParser());
var sessionStore = new MySQLStore(lv_Db.pt_Data.DB);

const sessionMiddleware = session({
  secret: "subscribe_loutbtbahah4281!@",
  resave: true,
  saveUninitialized: false,  
  store: sessionStore,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000 * 7, // 24 hours
  },
});

app.use(sessionMiddleware);
app.use("/data", express.static(path.join(__dirname, "../../data")));
app.use(
  "/assets",                                   //  /assets/* 요청
  express.static(path.join(__dirname, "../assets"))
);

// ② React 번들의 정적 파일
app.use(
  express.static(path.join(__dirname, "../build"), {
    index: false,                               // index.html 은 직접 라우트에서 전송
  })
);

import psd from './router/psd';
app.use("/psd", psd);


// ⑤ React SPA 용 catch‑all
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "../build/index.html"));
});

console.log(
  "[routes]",
  app._router.stack
    .filter((l: { route: any; }) => l.route)
    .map((l: { route: { methods: {}; path: any; }; }) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`)
);

const server = app.listen(3000, () => {
  console.log(`Example app listening on port ${3000}`);
}).setTimeout(12000000);

server.keepAliveTimeout = 300; // Keep-Alive 연결 제한 시간
server.headersTimeout = 11000; // 헤더 대기 시간

export default app;