# Deploy Notify Skill

매주 Linear에서 다음 주 배포 예정 이슈를 수집하고, Notion/Figma에서 관련 문서와 디자인을 찾아 ChannelTalk 팀챗으로 발송하는 자동화 워크플로우.

## 트리거

사용자가 다음 중 하나를 요청할 때 이 스킬을 실행한다:
- "배포 알림 보내줘"
- "다음 주 배포 이슈 정리해줘"
- "deploy-notify 실행해줘"
- 또는 schedule 스킬에 의해 매주 월요일 오전 9시에 자동 실행

---

## 사전 조건: ChannelTalk Access Key 확인

다음 순서로 `CHANNELTALK_ACCESS_KEY` 환경 변수를 확인한다:

```bash
# 1. 이미 환경에 설정되어 있는지 확인
echo "${CHANNELTALK_ACCESS_KEY:+set}"

# 2. 없으면 로컬 설정 파일에서 로드
source ~/.deploy-notify.env 2>/dev/null
```

`CHANNELTALK_ACCESS_KEY`가 여전히 미설정이면 다음 오류 메시지를 출력하고 중단:

> ❌ CHANNELTALK_ACCESS_KEY가 설정되지 않았습니다.
> `~/.deploy-notify.env` 파일을 생성하고 Access Key를 입력해주세요.
> 참고: `config/deploy-notify.env.example`
> 발급: ChannelTalk 관리자 콘솔 → 설정 → 개발 → Open API → Access Key

---

## Step 1 — 다음 주 날짜 범위 계산

아래 bash 코드를 실행해 다음 주 월요일~일요일 날짜를 구한다 (GNU date, Linux):

```bash
TODAY=$(date +%u)  # 1=월 … 7=일
DAYS_TO_NEXT_MON=$(( (8 - TODAY) % 7 ))
[ "$DAYS_TO_NEXT_MON" -eq 0 ] && DAYS_TO_NEXT_MON=7
NEXT_MON=$(date -d "+${DAYS_TO_NEXT_MON} days" +%Y-%m-%d)
NEXT_SUN=$(date -d "+$(( DAYS_TO_NEXT_MON + 6 )) days" +%Y-%m-%d)
echo "범위: $NEXT_MON ~ $NEXT_SUN"
```

---

## Step 2 — Linear 이슈 조회

`mcp__34441131-4cac-440e-98ba-10a17ca0715e__list_issues` 를 호출한다.

필터 조건:
- `dueDate` ≥ NEXT_MON AND ≤ NEXT_SUN
- 완료(completed) / 취소(cancelled) 상태 제외

각 이슈에서 수집할 필드:
- `id`, `title`, `description`, `url`, `dueDate`
- `assignee.name` (없으면 "미지정")
- `team.name`

**이슈가 0건이면:**
ChannelTalk에 아래 메시지를 발송하고 종료한다:
> 📋 다음 주 ({NEXT_MON} ~ {NEXT_SUN}) 배포 예정 이슈가 없습니다.

---

## Step 3 — Notion 관련 문서 검색

각 이슈에 대해 `mcp__2f5ab433-66e4-45c1-b641-9ef85859d015__notion-search` 를 호출한다.

- 검색어: 이슈 `title`
- 첫 번째 결과의 URL을 `notion_url`로 저장
- 결과 없거나 오류 발생 시 → `notion_url = null` (오류는 무시하고 계속 진행)

---

## Step 4 — Figma 관련 디자인 검색

각 이슈에 대해 `mcp__b484c971-17c5-4ba4-a5b4-ab353059d993__search_design_system` 을 호출한다.

- 검색어: 이슈 `title`
- 첫 번째 결과의 URL을 `figma_url`로 저장
- 결과 없거나 오류 발생 시 → `figma_url = null` (오류는 무시하고 계속 진행)

---

## Step 5 — 메시지 포맷

아래 템플릿으로 이슈별 블록을 생성한 후 하나의 문자열로 합친다.

**헤더:**
```
📋 *다음 주 배포 예정 이슈* (NEXT_MON ~ NEXT_SUN)
```

**이슈 블록 (이슈당 1개):**
```
🚀 *[이슈 제목]*
[description 앞 100자 — 없으면 생략]
담당자: @[assignee.name] | 배포일: [dueDate] ([한국어 요일])
🔗 Linear: [url]
📝 Notion: [notion_url]   ← notion_url이 있을 때만
🎨 Figma:  [figma_url]    ← figma_url이 있을 때만
─────────────────────
```

**한국어 요일 매핑:** 월요일 화요일 수요일 목요일 금요일 토요일 일요일

**최종 메시지 예시:**
```
📋 *다음 주 배포 예정 이슈* (2026-04-06 ~ 2026-04-12)

🚀 *결제 플로우 리디자인*
새로운 UI/UX 가이드 기반으로 결제 단계를 3단계에서 2단계로 개선
담당자: @김민준 | 배포일: 2026-04-08 (수요일)
🔗 Linear: https://linear.app/team/issue/ENG-412
📝 Notion: https://www.notion.so/...
🎨 Figma: https://www.figma.com/file/...
─────────────────────

🚀 *온보딩 튜토리얼 개선*
신규 사용자 활성화율 향상을 위한 인터랙티브 튜토리얼 추가
담당자: @이서연 | 배포일: 2026-04-10 (금요일)
🔗 Linear: https://linear.app/team/issue/ENG-398
─────────────────────
```

---

## Step 6 — ChannelTalk Open API POST

`jq`를 사용해 JSON을 안전하게 구성하고 `curl`로 POST한다.

대상 그룹: `groups/356599`

```bash
HTTP_STATUS=$(curl -s -o /tmp/channeltalk_response.txt -w "%{http_code}" \
  -X POST "https://api.channel.io/open/v5/group-messages" \
  -H "x-access-key: $CHANNELTALK_ACCESS_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg msg "$MESSAGE" '{
    "groupKey": "groups/356599",
    "blocks": [{"type": "text", "value": $msg}]
  }')")

if [[ "$HTTP_STATUS" =~ ^2 ]]; then
  echo "✅ ChannelTalk 발송 성공 (HTTP $HTTP_STATUS)"
else
  echo "❌ ChannelTalk 발송 실패 (HTTP $HTTP_STATUS)"
  cat /tmp/channeltalk_response.txt
  exit 1
fi
```

> ⚠️ Access Key는 절대 echo하거나 로그에 출력하지 않는다.

---

## Step 7 — 완료 보고

다음 정보를 출력한다:
- 발견된 이슈 수
- 이슈별 Notion/Figma 링크 수집 여부
- ChannelTalk HTTP 응답 코드

---

## 오류 처리 규칙

| 상황 | 처리 |
|------|------|
| Linear API 오류 | 즉시 중단, 오류 내용 출력 |
| Notion/Figma 검색 오류 | 해당 링크 생략 후 계속 진행 |
| CHANNELTALK_ACCESS_KEY 미설정 | 즉시 중단, 설정 안내 출력 |
| ChannelTalk POST 실패 (비2xx) | 상태코드 + 응답 body 출력 후 exit 1 |
| `jq` 미설치 | "jq가 설치되지 않았습니다. \`brew install jq\` 또는 \`apt install jq\`로 설치해주세요." 출력 후 중단 |
