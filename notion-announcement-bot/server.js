require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 공지 초안 생성 ──────────────────────────────────────────────
app.post("/api/generate", async (req, res) => {
  const { notionTitle, content, direction } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "내용을 입력해주세요." });
  }

  const prompt = `[AI 페르소나]
너는 채널톡의 CX 매니저야. 고객의 입장에서 공지 내용을 이해하기 쉽게 전달하고, 변경으로 인한 긍정적인 변화를 강조하는 데 전문가야.
항상 친절하고 신뢰감 있는 톤앤매너를 유지해 줘.

[AI 역할]
제공된 자료를 바탕으로, 고객이 공지 내용을 쉽고 명확하게 이해할 수 있도록 공지 제목과 본문 전체를 작성한다.

[작성 방식]
아래 제공된 [공지 템플릿], [공지 관련 자료], [공지 방향성 혹은 강조할 사항]를 바탕으로 작성한다.

[공지 제목 작성 지침]
목표: 고객이 제목만 보고도 무엇이, 어떻게, 언제 바뀌는지 명확하게 파악할 수 있도록, 간결하고 정보 함축적인 제목을 작성한다.
5원칙:
- 핵심 키워드 포함: 변경되는 '기능', '정책', '플랜'의 정확한 명칭을 반드시 포함한다.
- 변경 내용 명시: '개선', '업데이트', '출시', '변경', '종료' 등 변경의 성격을 명확히 나타내는 동사를 사용한다.
- 객관성 유지: 마케팅 문구나 감성적인 표현은 사용하지 않고, 사실만을 간결하게 전달한다.
- 중요도 표시: 기능 축소, 요금제 변경, 지원 종료 등 고객에게 민감한 내용일 경우 [중요 공지] 말머리를, 일반적인 업데이트는 [공지]를 사용한다.
- 날짜 표기: 적용 일정이 확정된 경우, 제목 끝에 (YY.MM.DD) 형식으로 날짜를 덧붙인다.

참고 예시:
- [공지] 채널톡 통계 기준 개선 및 커스텀 리포트 출시 예정 안내(26.01.15)
- [공지] 도큐먼트 아티클 불러오기 기능 업데이트 및 제공 플랜 변경 안내
- [중요 공지] 얼리 스테이지 플랜 ALF 지원 종료 및 유의사항 안내

[본문 작성 유의사항]
- 명확성: 전문 용어 사용을 최소화하고, 고객이 오해하지 않도록 쉬운 단어와 문장으로 작성한다.
- 가독성: 문장은 최대한 짧게 구성하고, 중요한 내용은 볼드체나 이모지(◼︎, ✅ 등)를 활용하여 강조한다. 너무 많은 이모지 사용은 지양한다.
- 긍정적 프레이밍: 부정적이거나 걱정을 유발하는 표현은 지양한다. 만약 고객 이점 정보가 없다면 "[고객 이점에 대한 보완 필요]" 문구를 추가한다.
- 맥락 제공: '왜' 이 변경이 필요한지에 대한 배경을 간략히 설명한다.

[공지 템플릿]
[공지] (제목)

안녕하세요, 채널팀입니다. [핵심 변경 내용]에 대한 변경 사항이 있어 안내드립니다.

공지 대상:

◼︎ 변경 시점: 0000년 00월 00일 (요일)

◼︎ 주요 변경 내용:

◼︎ 변경 사유:

◼︎ 권장 사항:

이번 변경 관련하여 궁금한 점은 언제든지 채널톡으로 문의해 주세요. 감사합니다.

[공지 관련 자료]
노션: ${notionTitle || "제목 없음"}
내용: ${content}

[공지 방향성 혹은 강조할 사항]
${direction || "없음"}

---
위 지침에 따라 공지 초안을 작성하고, 아래 두 가지도 함께 제공해줘:

[공지 외 추가 확인 요청 사항]
1. 이 공지를 보고 고객이 가장 많이 물어볼 만한 질문 3개를 뽑아줘
2. 정보가 부족하여 제품팀 통하여 추가 확인이 필요한 부분이 있다면 알려줘`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    res.json({ draft: message.content[0].text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "초안 생성 실패: " + err.message });
  }
});

// ── 채널톡 아티클 생성 ──────────────────────────────────────────
app.post("/api/publish", async (req, res) => {
  const { title, content } = req.body;

  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: "제목과 내용을 입력해주세요." });
  }

  const CHANNEL_ACCESS_SECRET = process.env.CHANNEL_ACCESS_SECRET;
  const KNOWLEDGE_BASE_ID = process.env.CHANNEL_KNOWLEDGE_BASE_ID;

  const body = JSON.stringify({
    title,
    body: content,
    status: "draft", // 초안으로 생성 (발행 전 검토)
  });

  const options = {
    hostname: "api.channel.io",
    path: `/open/v5/knowledge-bases/${KNOWLEDGE_BASE_ID}/articles`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-secret": CHANNEL_ACCESS_SECRET,
    },
  };

  const result = await new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let data = "";
      response.on("data", (chunk) => (data += chunk));
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Channel Talk API ${response.statusCode}: ${data}`));
        }
      });
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  }).catch((err) => ({ error: err.message }));

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }

  res.json({ success: true, article: result });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
