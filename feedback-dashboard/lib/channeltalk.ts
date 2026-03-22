export interface Feedback {
  id: string;
  title: string;
  userVoice: string;
  managerComment: string;
  channelName: string;
  servicePlan: string;
  createdAt: string;
  author: string;
  threadUrl?: string;
}

interface ChannelTalkMessage {
  id: string;
  plainText: string;
  createdAt: number;
  personType: string;
  personId: string;
}

interface ChannelTalkResponse {
  messages: ChannelTalkMessage[];
  next?: string;
}

function parseFeedbackMessage(message: ChannelTalkMessage, groupId: string): Feedback | null {
  const text = message.plainText || "";

  // FeedbackBot 메시지 형식 파싱
  // 제목: 첫 줄 (볼드 텍스트 또는 [KR]/[EN] 접두어)
  const titleMatch = text.match(/^\*?\*?\[?(?:KR|EN)?\]?\s*(.+?)(?:\*\*)?(?:\s+by\s+@\S+)?\n/);
  const title = titleMatch ? titleMatch[1].trim() : text.split("\n")[0].trim();

  // User voice 파싱
  const userVoiceMatch = text.match(/User voice\s*\n([\s\S]*?)(?=Manager comment|Channel Name|------|\n\n)/i);
  const userVoice = userVoiceMatch ? userVoiceMatch[1].trim() : "";

  // Manager comment 파싱
  const managerCommentMatch = text.match(/Manager comment\s*\n([\s\S]*?)(?=Channel Name|------|\n\n|$)/i);
  const managerComment = managerCommentMatch ? managerCommentMatch[1].trim() : "";

  // Channel Name 파싱
  const channelNameMatch = text.match(/Channel Name\s*[:：]\s*(.+)/i);
  const channelName = channelNameMatch ? channelNameMatch[1].trim() : "";

  // Service Plan 파싱
  const servicePlanMatch = text.match(/Service Plan\s*[:：]\s*(.+)/i);
  const servicePlan = servicePlanMatch ? servicePlanMatch[1].trim() : "";

  // author 파싱
  const authorMatch = text.match(/by\s+@(\S+)/);
  const author = authorMatch ? authorMatch[1] : "";

  // 유효한 피드백인지 확인 (User voice 또는 제목이 있어야 함)
  if (!title && !userVoice) return null;

  return {
    id: message.id,
    title,
    userVoice,
    managerComment,
    channelName,
    servicePlan,
    createdAt: new Date(message.createdAt).toISOString(),
    author,
    threadUrl: `https://desk.channel.io/team-chats/${groupId}`,
  };
}

export async function fetchFeedbacks(
  channelId: string,
  apiKey: string,
  apiSecret: string,
  startDate: string,
  endDate: string
): Promise<Feedback[]> {
  const startTs = new Date(startDate).getTime();
  const endTs = new Date(endDate).getTime() + 86400000; // 종료일 포함

  const allFeedbacks: Feedback[] = [];
  let nextCursor: string | undefined;

  do {
    const params = new URLSearchParams({
      groupId: channelId,
      since: String(startTs),
      until: String(endTs),
      limit: "100",
    });
    if (nextCursor) params.set("since", nextCursor);

    const res = await fetch(
      `https://api.channel.io/open/v5/group-messages?${params}`,
      {
        headers: {
          "x-access-key": apiKey,
          "x-access-secret": apiSecret,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`채널톡 API 오류 (${res.status}): ${errorText}`);
    }

    const data: ChannelTalkResponse = await res.json();

    for (const msg of data.messages || []) {
      // FeedbackBot 메시지 필터링 (bot 메시지 또는 "User voice" 포함)
      if (
        msg.personType === "bot" ||
        (msg.plainText && msg.plainText.includes("User voice"))
      ) {
        const feedback = parseFeedbackMessage(msg, channelId);
        if (feedback) allFeedbacks.push(feedback);
      }
    }

    nextCursor = data.next;
  } while (nextCursor);

  return allFeedbacks;
}
