export interface NotionPage {
  id: string;
  title: string;
  url: string;
  htmlContent: string;
  children: NotionPage[];
}

export interface ChannelTalkSpace {
  id: string;
  name: string;
  accessKey: string;
  accessSecret: string;
}

export interface SyncRequest {
  notionUrl: string;
  notionToken: string;
  includeSubPages: boolean;
  channeltalkAccessKey: string;
  channeltalkAccessSecret: string;
}

export interface SyncResult {
  pageTitle: string;
  notionPageId: string;
  status: "success" | "error";
  articleUrl?: string;
  articleId?: string;
  error?: string;
}
