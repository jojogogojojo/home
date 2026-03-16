const https = require("https");

const CHANNEL_ACCESS_SECRET = process.env.CHANNEL_ACCESS_SECRET;

// Channel Talk Open API - 팀챗 메시지 전송
// docs: https://developers.channel.io/docs/open-api

/**
 * 채널톡 팀챗 그룹에 메시지 전송
 * @param {string} groupId - 팀챗 그룹 ID
 * @param {string} text - 전송할 텍스트
 */
async function sendToTeamChat(groupId, text) {
  const body = JSON.stringify({
    broadcastGroupId: groupId,
    rootMessageType: "ANNOUNCEMENT",
    plainText: text,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.channel.io",
        path: "/open/v5/team-chats/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-access-secret": CHANNEL_ACCESS_SECRET,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Channel Talk API error: ${res.statusCode} ${data}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = { sendToTeamChat };
