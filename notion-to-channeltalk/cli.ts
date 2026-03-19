#!/usr/bin/env tsx
/**
 * notion-to-channeltalk CLI
 *
 * 사용법:
 *   npx tsx cli.ts [옵션]
 *   npm run cli -- [옵션]
 *
 * 옵션:
 *   --notion-token <token>      Notion Integration Token (또는 NOTION_TOKEN 환경변수)
 *   --notion-url <url>          Notion 페이지 URL (또는 NOTION_URL 환경변수)
 *   --access-key <key>          Channel Talk Access Key (또는 CT_ACCESS_KEY 환경변수)
 *   --access-secret <secret>    Channel Talk Access Secret (또는 CT_ACCESS_SECRET 환경변수)
 *   --include-sub-pages         하위 페이지 포함 (기본값: false)
 *   --dry-run                   실제 생성 없이 가져올 페이지 목록만 확인
 *
 * 환경변수 파일:
 *   .env 파일에 위 환경변수를 설정하면 자동으로 불러옵니다.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fetchNotionPages } from "./src/lib/notion";
import { createArticle, getSpace } from "./src/lib/channeltalk";

// ──────────────────────────────────────────────
// .env 파일 로드 (dotenv 없이 직접 파싱)
// ──────────────────────────────────────────────
function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ──────────────────────────────────────────────
// CLI 인수 파싱
// ──────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// ──────────────────────────────────────────────
// 출력 유틸
// ──────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function log(msg: string) { console.log(msg); }
function ok(msg: string) { log(`${c.green}✓${c.reset} ${msg}`); }
function err(msg: string) { log(`${c.red}✗${c.reset} ${msg}`); }
function info(msg: string) { log(`${c.cyan}→${c.reset} ${msg}`); }
function warn(msg: string) { log(`${c.yellow}!${c.reset} ${msg}`); }
function header(msg: string) { log(`\n${c.bold}${msg}${c.reset}`); }

// ──────────────────────────────────────────────
// 메인
// ──────────────────────────────────────────────
async function main() {
  loadDotEnv();

  const args = parseArgs(process.argv.slice(2));

  const notionToken =
    (args["notion-token"] as string) || process.env.NOTION_TOKEN || "";
  const notionUrl =
    (args["notion-url"] as string) || process.env.NOTION_URL || "";
  const accessKey =
    (args["access-key"] as string) || process.env.CT_ACCESS_KEY || "";
  const accessSecret =
    (args["access-secret"] as string) || process.env.CT_ACCESS_SECRET || "";
  const includeSubPages = !!args["include-sub-pages"];
  const dryRun = !!args["dry-run"];

  // ── 입력 검증 ──
  const missing: string[] = [];
  if (!notionToken) missing.push("NOTION_TOKEN (--notion-token)");
  if (!notionUrl) missing.push("NOTION_URL (--notion-url)");
  if (!accessKey) missing.push("CT_ACCESS_KEY (--access-key)");
  if (!accessSecret) missing.push("CT_ACCESS_SECRET (--access-secret)");

  if (missing.length > 0) {
    err("필수 값이 없습니다:");
    for (const m of missing) log(`  ${c.gray}-${c.reset} ${m}`);
    log(`\n${c.gray}사용법: npm run cli -- --notion-token <token> --notion-url <url> --access-key <key> --access-secret <secret>${c.reset}`);
    log(`${c.gray}또는 .env 파일에 NOTION_TOKEN, NOTION_URL, CT_ACCESS_KEY, CT_ACCESS_SECRET 를 설정하세요.${c.reset}`);
    process.exit(1);
  }

  header("Notion → Channel Talk 동기화");
  log(`${c.gray}${"─".repeat(50)}${c.reset}`);

  // ── Channel Talk 인증 확인 ──
  info("Channel Talk 인증 확인 중...");
  try {
    const space = await getSpace(accessKey, accessSecret);
    ok(`스페이스: ${c.bold}${space.name}${c.reset} (${space.id})`);
  } catch (e: unknown) {
    err(`Channel Talk 인증 실패: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  // ── Notion 페이지 가져오기 ──
  info(`Notion 페이지 가져오는 중${includeSubPages ? " (하위 페이지 포함)" : ""}...`);
  let pages;
  try {
    pages = await fetchNotionPages(notionUrl, notionToken, includeSubPages);
  } catch (e: unknown) {
    err(`Notion 가져오기 실패: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  ok(`${pages.length}개 페이지 발견`);
  for (const p of pages) {
    log(`  ${c.gray}·${c.reset} ${p.title}`);
  }

  if (dryRun) {
    warn("--dry-run 모드: 실제 아티클은 생성되지 않습니다.");
    return;
  }

  // ── 아티클 생성 ──
  header("아티클 생성 중");
  log(`${c.gray}${"─".repeat(50)}${c.reset}`);

  let successCount = 0;
  let failCount = 0;

  for (const page of pages) {
    try {
      const article = await createArticle(
        accessKey,
        accessSecret,
        page.title,
        page.htmlContent
      );
      ok(`${page.title}`);
      if (article.webUrl || article.url) {
        log(`  ${c.gray}${article.webUrl || article.url}${c.reset}`);
      }
      successCount++;
    } catch (e: unknown) {
      err(`${page.title}`);
      log(`  ${c.red}${e instanceof Error ? e.message : e}${c.reset}`);
      failCount++;
    }
  }

  // ── 결과 요약 ──
  header("완료");
  log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  log(`성공: ${c.green}${successCount}${c.reset}개  /  실패: ${c.red}${failCount}${c.reset}개`);
  log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
