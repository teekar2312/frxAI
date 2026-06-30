-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "broker" TEXT NOT NULL DEFAULT 'FINEX Indonesia',
    "server" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'demo',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "leverage" TEXT NOT NULL DEFAULT '1:100',
    "balance" REAL NOT NULL DEFAULT 10000,
    "equity" REAL NOT NULL DEFAULT 10000,
    "margin" REAL NOT NULL DEFAULT 0,
    "freeMargin" REAL NOT NULL DEFAULT 10000,
    "marginLevel" REAL NOT NULL DEFAULT 0,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "lotSize" REAL NOT NULL,
    "openPrice" REAL NOT NULL,
    "closePrice" REAL,
    "stopLoss" REAL,
    "takeProfit" REAL,
    "trailingStop" BOOLEAN NOT NULL DEFAULT false,
    "trailingPips" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "pnl" REAL NOT NULL DEFAULT 0,
    "pips" REAL NOT NULL DEFAULT 0,
    "commission" REAL NOT NULL DEFAULT 0,
    "swap" REAL NOT NULL DEFAULT 0,
    "strategy" TEXT NOT NULL DEFAULT 'scalping-m5',
    "timeframe" TEXT NOT NULL DEFAULT 'M5',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "comment" TEXT,
    "mt5Ticket" INTEGER,
    "mt5Server" TEXT,
    "openTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closeTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "lotSize" REAL NOT NULL,
    "price" REAL NOT NULL,
    "stopLoss" REAL,
    "takeProfit" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "openTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Indicator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultParams" TEXT NOT NULL,
    "scalpingPreset" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoManaged" BOOLEAN NOT NULL DEFAULT false,
    "weight" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "url" TEXT,
    "category" TEXT NOT NULL,
    "impact" TEXT NOT NULL DEFAULT 'medium',
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "symbols" TEXT NOT NULL DEFAULT '',
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "triggeredAt" DATETIME,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'system',
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Backtest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL DEFAULT 'M5',
    "strategy" TEXT NOT NULL,
    "periodFrom" DATETIME NOT NULL,
    "periodTo" DATETIME NOT NULL,
    "initialCapital" REAL NOT NULL,
    "finalCapital" REAL NOT NULL,
    "totalTrades" INTEGER NOT NULL,
    "winTrades" INTEGER NOT NULL,
    "lossTrades" INTEGER NOT NULL,
    "winRate" REAL NOT NULL,
    "profitFactor" REAL NOT NULL,
    "maxDrawdown" REAL NOT NULL,
    "sharpeRatio" REAL NOT NULL,
    "netProfit" REAL NOT NULL,
    "equityCurve" TEXT NOT NULL,
    "tradesJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "timeframe" TEXT NOT NULL DEFAULT 'M5',
    "reasoning" TEXT NOT NULL,
    "selectedIndicators" TEXT NOT NULL,
    "factors" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'wait',
    "modelVersion" TEXT NOT NULL DEFAULT 'fx-scalper-v1',
    "accuracy" REAL NOT NULL DEFAULT 0,
    "priceAtSignal" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiSignalOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "signalId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "priceAtSignal" REAL NOT NULL,
    "priceAtEval" REAL NOT NULL,
    "priceChange" REAL NOT NULL,
    "priceChangePct" REAL NOT NULL,
    "pipsMoved" REAL NOT NULL,
    "correct" BOOLEAN,
    "evaluatedAt" DATETIME,
    CONSTRAINT "AiSignalOutcome_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "AiSignal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'trader',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EconomicEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "eventTime" DATETIME NOT NULL,
    "actual" TEXT,
    "forecast" TEXT,
    "previous" TEXT,
    "surprise" TEXT,
    "symbols" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "source" TEXT NOT NULL DEFAULT 'marketaux',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Trade_accountId_idx" ON "Trade"("accountId");

-- CreateIndex
CREATE INDEX "Trade_symbol_idx" ON "Trade"("symbol");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE INDEX "Trade_mt5Ticket_idx" ON "Trade"("mt5Ticket");

-- CreateIndex
CREATE INDEX "Order_accountId_idx" ON "Order"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Indicator_name_key" ON "Indicator"("name");

-- CreateIndex
CREATE INDEX "NewsItem_category_idx" ON "NewsItem"("category");

-- CreateIndex
CREATE INDEX "NewsItem_impact_idx" ON "NewsItem"("impact");

-- CreateIndex
CREATE INDEX "NewsItem_publishedAt_idx" ON "NewsItem"("publishedAt");

-- CreateIndex
CREATE INDEX "Alert_symbol_idx" ON "Alert"("symbol");

-- CreateIndex
CREATE INDEX "Alert_active_idx" ON "Alert"("active");

-- CreateIndex
CREATE INDEX "Log_level_idx" ON "Log"("level");

-- CreateIndex
CREATE INDEX "Log_source_idx" ON "Log"("source");

-- CreateIndex
CREATE INDEX "Log_createdAt_idx" ON "Log"("createdAt");

-- CreateIndex
CREATE INDEX "Backtest_symbol_idx" ON "Backtest"("symbol");

-- CreateIndex
CREATE INDEX "AiSignal_symbol_idx" ON "AiSignal"("symbol");

-- CreateIndex
CREATE INDEX "AiSignal_createdAt_idx" ON "AiSignal"("createdAt");

-- CreateIndex
CREATE INDEX "AiSignal_action_idx" ON "AiSignal"("action");

-- CreateIndex
CREATE UNIQUE INDEX "AiSignalOutcome_signalId_key" ON "AiSignalOutcome"("signalId");

-- CreateIndex
CREATE INDEX "AiSignalOutcome_symbol_idx" ON "AiSignalOutcome"("symbol");

-- CreateIndex
CREATE INDEX "AiSignalOutcome_correct_idx" ON "AiSignalOutcome"("correct");

-- CreateIndex
CREATE INDEX "AiSignalOutcome_evaluatedAt_idx" ON "AiSignalOutcome"("evaluatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSetting_key_key" ON "RiskSetting"("key");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_sessionToken_key" ON "UserSession"("sessionToken");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "EconomicEvent_eventTime_idx" ON "EconomicEvent"("eventTime");

-- CreateIndex
CREATE INDEX "EconomicEvent_impact_idx" ON "EconomicEvent"("impact");

-- CreateIndex
CREATE INDEX "EconomicEvent_category_idx" ON "EconomicEvent"("category");

-- CreateIndex
CREATE INDEX "EconomicEvent_country_idx" ON "EconomicEvent"("country");
