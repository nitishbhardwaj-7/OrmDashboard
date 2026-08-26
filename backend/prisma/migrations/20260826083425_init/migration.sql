-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keywordId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "rawResponse" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "ScrapeRun_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceKey" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "scrapeRunId" TEXT NOT NULL,
    "platform" TEXT,
    "text" TEXT,
    "url" TEXT,
    "author" TEXT,
    "authorUrl" TEXT,
    "publishedAt" DATETIME,
    "likes" INTEGER,
    "shares" INTEGER,
    "commentsCount" INTEGER,
    "rawItem" TEXT NOT NULL,
    "sentiment" TEXT,
    "confidence" REAL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "processingError" TEXT,
    "analyzedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Post_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceKey" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "scrapeRunId" TEXT NOT NULL,
    "postId" TEXT,
    "text" TEXT,
    "url" TEXT,
    "author" TEXT,
    "authorUrl" TEXT,
    "publishedAt" DATETIME,
    "likes" INTEGER,
    "rawItem" TEXT NOT NULL,
    "sentiment" TEXT,
    "confidence" REAL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "processingError" TEXT,
    "analyzedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Comment_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Comment_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_term_key" ON "Keyword"("term");

-- CreateIndex
CREATE INDEX "ScrapeRun_keywordId_idx" ON "ScrapeRun"("keywordId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_sourceKey_key" ON "Post"("sourceKey");

-- CreateIndex
CREATE INDEX "Post_keywordId_idx" ON "Post"("keywordId");

-- CreateIndex
CREATE INDEX "Post_sentiment_idx" ON "Post"("sentiment");

-- CreateIndex
CREATE INDEX "Post_status_idx" ON "Post"("status");

-- CreateIndex
CREATE INDEX "Post_publishedAt_idx" ON "Post"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_sourceKey_key" ON "Comment"("sourceKey");

-- CreateIndex
CREATE INDEX "Comment_keywordId_idx" ON "Comment"("keywordId");

-- CreateIndex
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");

-- CreateIndex
CREATE INDEX "Comment_sentiment_idx" ON "Comment"("sentiment");

-- CreateIndex
CREATE INDEX "Comment_status_idx" ON "Comment"("status");

-- CreateIndex
CREATE INDEX "Comment_publishedAt_idx" ON "Comment"("publishedAt");
