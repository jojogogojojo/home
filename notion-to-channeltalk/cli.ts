#!/usr/bin/env tsx
/**
 * notion-to-channeltalk 인터랙티브 CLI
 * 실행: npm run cli
 */

import { createInterface } from "readline";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fetchNotionPages } from "./src/lib/notion";
import { createArticle, getSpace } from "./src/lib/channeltalk";
import type { NotionPage } from "./src/types";

// ── .env 로드 ──────────────────────────────────
function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

// ── 색상 ───────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

const ok   = (s: string) => console.log(`${c.green}✓${c.reset} ${s}`);
const fail = (s: string) => console.log(`${c.red}✗${c.reset} ${s}`);
const info = (s: string) => console.log(`${c.cyan}→${c.reset} ${s}`);
const warn = (s: string) => console.log(`${c.yellow}!${c.reset} ${s}`);
const hr   = () => console.log(`${c.dim}${"─".repeat(55)}${c.reset}`);
const nl   = () => console.log("");

// ── readline 유틸 ──────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt(question: string, defaultVal = ""): Promise<string> {
  const hint = defaultVal ? ` ${c.dim}[${defaultVal.slice(0, 20)}${defaultVal.length > 20 ? "…" : ""}]${c.reset}` : "";
  return new Promise((resolve) => {
    rl.question(`${c.bold}?${c.reset} ${question}${hint}: `, (ans) => {
      resolve(ans.trim() || defaultVal);
    });
  });
}

function promptSecret(question: string, defaultVal = ""): Promise<string> {
  const hint = defaultVal ? ` ${c.dim}[설정됨]${c.reset}` : "";
  return new Promise((resolve) => {
    process.stdout.write(`${c.bold}?${c.reset} ${question}${hint}: `);
    // 입력 숨기기
    const stdin = process.stdin;
    let value = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    if (defaultVal) {
      // defaultVal 있으면 엔터만 쳐도 사용
    }

    const onData = (ch: string) => {
      if (ch === "\n" || ch === "\r" || ch === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value || defaultVal);
      } else if (ch === "\u0003") {
        process.stdout.write("\n");
        process.exit();
      } else if (ch === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += ch;
        process.stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}

function promptYN(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`${c.bold}?${c.reset} ${question} ${c.dim}(${hint})${c.reset}: `, (ans) => {
      const a = ans.trim().toLowerCase();
      if (!a) resolve(defaultYes);
      else resolve(a === "y" || a === "yes");
    });
  });
}

// ── 페이지 트리 출력 ───────────────────────────
function printPageTree(pages: NotionPage[], indent = 0) {
  for (const p of pages) {
    const prefix = indent === 0 ? `${c.blue}◆${c.reset}` : `${c.dim}${"  ".repeat(indent)}└─${c.reset}`;
    const size = p.htmlContent.length;
    const sizeStr = size > 1024
      ? `${c.dim}(${(size / 1024).toFixed(1)}KB)${c.reset}`
      : `${c.dim}(${size}B)${c.reset}`;
    console.log(`  ${prefix} ${p.title} ${sizeStr}`);
    if (p.children.length > 0) printPageTree(p.children, indent + 1);
  }
}

// ── 메인 ───────────────────────────────────────
async function main() {
  loadDotEnv();

  console.clear();
  console.log(`${c.bold}${c.magenta}╔══════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}║   Notion → Channel Talk 아티클 동기화 CLI   ║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚══════════════════════════════════════════════╝${c.reset}`);
  nl();

  // ── Step 1: 자격증명 입력 ──
  console.log(`${c.bold}[1/4] 자격증명 입력${c.reset}`);
  hr();

  const notionToken = await promptSecret(
    "Notion Integration Token",
    process.env.NOTION_TOKEN
  );
  const notionUrl = await prompt(
    "Notion 페이지 URL",
    process.env.NOTION_URL
  );
  const accessKey = await prompt(
    "Channel Talk Access Key",
    process.env.CT_ACCESS_KEY
  );
  const accessSecret = await promptSecret(
    "Channel Talk Access Secret",
    process.env.CT_ACCESS_SECRET
  );

  if (!notionToken || !notionUrl || !accessKey || !accessSecret) {
    fail("필수 값이 입력되지 않았습니다.");
    process.exit(1);
  }

  nl();

  // ── Step 2: Channel Talk 인증 확인 ──
  console.log(`${c.bold}[2/4] Channel Talk 연결 확인${c.reset}`);
  hr();
  info("인증 확인 중...");
  let spaceName = "";
  try {
    const space = await getSpace(accessKey, accessSecret);
    spaceName = space.name;
    ok(`스페이스: ${c.bold}${space.name}${c.reset} ${c.dim}(${space.id})${c.reset}`);
  } catch (e: unknown) {
    fail(`Channel Talk 인증 실패: ${e instanceof Error ? e.message : e}`);
    rl.close();
    process.exit(1);
  }
  nl();

  // ── Step 3: 옵션 선택 ──
  console.log(`${c.bold}[3/4] 옵션 선택${c.reset}`);
  hr();
  const includeSubPages = await promptYN("하위 페이지도 포함할까요?", true);
  nl();

  // ── Step 4: 미리보기 ──
  console.log(`${c.bold}[4/4] 미리보기${c.reset}`);
  hr();
  info(`Notion 페이지 가져오는 중${includeSubPages ? " (하위 페이지 포함)" : ""}...`);

  let allPages: NotionPage[];
  try {
    const rootPages = await fetchNotionPages(notionUrl, notionToken, includeSubPages);
    allPages = rootPages;
  } catch (e: unknown) {
    fail(`Notion 가져오기 실패: ${e instanceof Error ? e.message : e}`);
    rl.close();
    process.exit(1);
  }

  // 플랫 배열 (루트 + 모든 하위)
  const flatten = (pages: NotionPage[]): NotionPage[] =>
    pages.flatMap((p) => [p, ...flatten(p.children)]);
  const flatPages = flatten(allPages);

  nl();
  console.log(`${c.bold}생성될 아티클 목록 (총 ${c.cyan}${flatPages.length}${c.reset}${c.bold}개)${c.reset}`);
  hr();
  printPageTree(allPages);
  nl();

  console.log(`${c.dim}스페이스: ${spaceName}${c.reset}`);
  nl();

  const doSync = await promptYN(
    `${c.bold}위 ${flatPages.length}개 아티클을 Channel Talk에 생성할까요?${c.reset}`,
    true
  );

  if (!doSync) {
    warn("취소되었습니다.");
    rl.close();
    return;
  }

  rl.close();

  // ── 실제 동기화 ──
  nl();
  console.log(`${c.bold}아티클 생성 중...${c.reset}`);
  hr();

  let successCount = 0;
  let failCount = 0;

  for (const page of flatPages) {
    try {
      const article = await createArticle(
        accessKey,
        accessSecret,
        page.title,
        page.htmlContent
      );
      ok(`${page.title}`);
      const url = article.webUrl || article.url;
      if (url) console.log(`  ${c.dim}${url}${c.reset}`);
      successCount++;
    } catch (e: unknown) {
      fail(`${page.title}`);
      console.log(`  ${c.red}${e instanceof Error ? e.message : e}${c.reset}`);
      failCount++;
    }
  }

  nl();
  hr();
  console.log(
    `${c.bold}완료!${c.reset}  ` +
    `성공 ${c.green}${successCount}${c.reset}개  /  ` +
    `실패 ${failCount > 0 ? c.red : c.dim}${failCount}${c.reset}개`
  );
  nl();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
