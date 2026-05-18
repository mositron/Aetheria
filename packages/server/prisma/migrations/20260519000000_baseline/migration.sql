-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuctionListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerName" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "pricePer" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "leaderName" TEXT NOT NULL,
    "tag" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "membersJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Mail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toName" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "zeny" INTEGER NOT NULL DEFAULT 0,
    "itemId" TEXT NOT NULL DEFAULT '',
    "itemQty" INTEGER NOT NULL DEFAULT 0,
    "read" INTEGER NOT NULL DEFAULT 0,
    "claimed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "job" TEXT NOT NULL DEFAULT 'novice',
    "level" INTEGER NOT NULL DEFAULT 1,
    "exp" INTEGER NOT NULL DEFAULT 0,
    "hp" INTEGER NOT NULL DEFAULT 100,
    "maxHp" INTEGER NOT NULL DEFAULT 100,
    "mp" INTEGER NOT NULL DEFAULT 20,
    "maxMp" INTEGER NOT NULL DEFAULT 20,
    "atk" INTEGER NOT NULL DEFAULT 10,
    "def" INTEGER NOT NULL DEFAULT 0,
    "weapon" TEXT NOT NULL DEFAULT '',
    "armor" TEXT NOT NULL DEFAULT '',
    "mapId" TEXT NOT NULL DEFAULT 'field',
    "posX" REAL NOT NULL DEFAULT 0,
    "posY" REAL NOT NULL DEFAULT 0,
    "posZ" REAL NOT NULL DEFAULT 0,
    "inventoryJson" TEXT NOT NULL DEFAULT '[]',
    "str" INTEGER NOT NULL DEFAULT 1,
    "agi" INTEGER NOT NULL DEFAULT 1,
    "vit" INTEGER NOT NULL DEFAULT 1,
    "intel" INTEGER NOT NULL DEFAULT 1,
    "dex" INTEGER NOT NULL DEFAULT 1,
    "luk" INTEGER NOT NULL DEFAULT 1,
    "statPoints" INTEGER NOT NULL DEFAULT 0,
    "zeny" INTEGER NOT NULL DEFAULT 500,
    "questsJson" TEXT NOT NULL DEFAULT '{"active":{},"completed":[]}',
    "appearance" TEXT NOT NULL DEFAULT '{}',
    "hunger" REAL NOT NULL DEFAULT 100,
    "thirst" REAL NOT NULL DEFAULT 100,
    "stamina" REAL NOT NULL DEFAULT 100,
    "maxStamina" REAL NOT NULL DEFAULT 100,
    "houseSlot" INTEGER NOT NULL DEFAULT -1,
    "petKind" TEXT NOT NULL DEFAULT '',
    "mounted" INTEGER NOT NULL DEFAULT 0,
    "achievementsJson" TEXT NOT NULL DEFAULT '{}',
    "title" TEXT NOT NULL DEFAULT '',
    "lastLoginDate" TEXT NOT NULL DEFAULT '',
    "loginStreak" INTEGER NOT NULL DEFAULT 0,
    "petsJson" TEXT NOT NULL DEFAULT '[]',
    "petRare" INTEGER NOT NULL DEFAULT 0,
    "decorationsJson" TEXT NOT NULL DEFAULT '[]',
    "friendsJson" TEXT NOT NULL DEFAULT '[]',
    "guildId" TEXT NOT NULL DEFAULT '',
    "pvpFlag" INTEGER NOT NULL DEFAULT 0,
    "dailyJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "AuctionListing_itemId_idx" ON "AuctionListing"("itemId");

-- CreateIndex
CREATE INDEX "AuctionListing_sellerName_idx" ON "AuctionListing"("sellerName");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_name_key" ON "Guild"("name");

-- CreateIndex
CREATE INDEX "Mail_toName_read_idx" ON "Mail"("toName", "read");

-- CreateIndex
CREATE UNIQUE INDEX "Character_name_key" ON "Character"("name");

-- CreateIndex
CREATE INDEX "Character_userId_idx" ON "Character"("userId");

