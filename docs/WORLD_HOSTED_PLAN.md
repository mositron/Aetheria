# Server-Hosted World Plan

> ✅ **IMPLEMENTED** (BACKLOG P3.29). Player-created worlds with invite
> codes work end-to-end: `WorldRoom` accepts `worldId/worldName/worldMode/
> worldTemplate/maxPlayers`, `WorldManager` tracks invite codes, Colyseus
> room instantiated lazily via `joinOrCreate("world", { worldId })`,
> Co-op / PvP / Adventure mode flags enforced server-side. HUD shows
> world name + mode badge + player count. This document is kept as
> historical design context.

สำหรับเกมแนว Open-World ที่ผู้เล่นไม่ต้องสร้างแผนที่เอง แต่สามารถสร้าง world ใหม่จากระบบ แล้วชวนเพื่อนเข้าเล่นได้

## เป้าหมายหลัก
- ให้ผู้เล่นสร้าง world โดยไม่ต้องวางบล็อกหรือออกแบบแมปเอง
- รองรับทั้งโหมด `public` และ `private invite`
- ให้ผู้เล่นเลือกโหมดได้ เช่น `co-op`, `PvP`, `battle royale` หรือ `exploration`
- ระบบเป็นผู้จัดการ room/world แบบ server-hosted เพื่อความเสถียร และไม่ต้องติดตั้งโปรแกรมเพิ่ม

## 1) โครงสร้างหลัก

### 1.1 World Creation Flow
1. ผู้เล่นเลือก:
   - world template (forest, desert, mountain, island)
   - difficulty หรือ theme
   - mode: `co-op`, `PvP`, `free roam`
   - player cap และ privacy: `public`, `friends only`, `private invite`
2. client ส่งคำขอสร้าง world ไปยัง server
3. server สร้าง `room session` ใหม่ พร้อม `world metadata`
4. server สร้าง world data ตาม template/seed
5. server คืน `join code` / `invite link` ให้ผู้เล่น
6. host และเพื่อนเข้าห้องเล่นได้ทันที

### 1.2 Room / Session Management
- ใช้ server-hosted room ที่ authoritative state:
  - character positions
  - world state (spawn, event, object state)
  - game rules / mode state
- การจัดการผู้เล่น:
  - `host` เป็นผู้สร้าง world
  - `room owner` สามารถตั้งค่า private/public, invite only
  - `server` ควบคุมการเข้าร่วมและสถานะ world

### 1.3 Private vs Public
- `Public world`: ผู้เล่นทั่วไปสามารถค้นหาและเข้าร่วมตามเงื่อนไข
- `Private world`: ต้องใช้ invite link/code หรือรับเชิญจาก friend list
- `Friends only`: ผู้เล่นที่เป็นเพื่อนกันเท่านั้นเข้าร่วมได้
- host ยังสามารถควบคุมได้ว่ารับเฉพาะผู้เล่นใหม่หรือไม่

## 2) โหมดเล่นที่ควรออกแบบ

### 2.1 Co-op
- ผู้เล่นร่วมกันสำรวจ world และทำภารกิจ
- world generator สร้างเนื้อเรื่องหรือกิจกรรมร่วมกัน
- ควรมีระบบ respawn และ revive เพื่อเล่นร่วมกันอย่างต่อเนื่อง

### 2.2 PvP / Battle
- ผู้เล่นสู้กันเองใน world เดียวกัน
- world generator สร้างสนามแข่ง หรือ zone ที่เหมาะสำหรับศึก
- สามารถกำหนดกติกาได้ เช่น `team deathmatch`, `free-for-all`, `captain mode`

### 2.3 Mixed / Event Mode
- world สามารถมี event ชั่วคราว เช่น boss, capture point, or survival wave
- ผู้เล่นสามารถเลือก world แล้วระบบกำหนดเกมเพลย์ให้แบบ dynamic

### 2.4 Exploration, Resource, Base and Companion Systems
- world ควรสนับสนุนการสำรวจแผนที่เพื่อค้นหาทรัพยากร, จุดสนใจ และกิจกรรม
- มีระบบ resource nodes ที่ spawn ตาม biome เช่น wood, stone, ore, food, fuel
- ระบบ base building พื้นฐาน:
  - place structures หรือ workstations แบบ predefined prefab
  - เก็บและจัดการ inventory/resources
  - upgrade base ด้วย resource และ unlock mechanics
- Companion/Pal-like helpers:
  - creatures หรือ units ที่ผู้เล่นสามารถเก็บ, เทรน, หรือเรียกใช้งาน
  - ใช้ช่วยทำงาน เช่น เก็บวัตถุดิบ, สร้างฐาน หรือขนของ
  - ใช้ช่วยต่อสู้: attacker, defender, support
- world generator ควรสร้างจุด spawn ของ resource และหน่วย AI ให้สอดคล้องกับ mode
- สามารถออกแบบให้ solo เป็น exploration/survival while co-op/PvP มี teamwork และ competition

## 3) World Generation Strategy

### 3.1 Seed-based Generation
- server สร้าง world จาก `seed` และ `template`
- world แต่ละรอบมีความแตกต่าง แต่ใช้ระบบเดียวกัน
- ดีสำหรับ replayability และ world ที่จัดการโดยระบบ

### 3.2 Template + Variation
- world template เช่น `forest`, `ruin`, `cave`
- server เพิ่ม variation ด้วย:
  - obstacle placement
  - enemy spawn
  - loot nodes
  - weather/biome mix

### 3.3 Persistent vs Session-based
- ถ้า world สร้างใหม่ทุกครั้ง: session-based world
- ถ้า world ต้องเก็บสถานะต่อ: persistent world with save/load
- สำหรับเริ่มต้น ควรใช้ session-based เพื่อเรียบง่าย

## 4) ระบบเชิญเพื่อนและการเข้าเล่น

### 4.1 Invite Link / Code
- ระบบสร้าง `room code` หรือ `invite link`
- ผู้สร้าง world ส่งให้เพื่อนผ่าน chat หรือ social
- เพื่อนกด link แล้วเข้าห้องโดยตรง

### 4.2 Friend List / Party
- ถ้ามี friend system:
  - ให้เลือกเพื่อนจากรายชื่อ
  - ส่งคำเชิญหรือ invite request
- host สามารถชวนเฉพาะคนที่เชื่อถือได้

### 4.3 Lobby และ Ready System
- ก่อนเข้า world ให้มี lobby room
- ผู้เล่นเลือก character, appearance, mode
- Ready / start game เมื่อครบตามเงื่อนไข

## 5) สถาปัตยกรรมที่แนะนำ

### 5.1 Client
- UI world creation / join
- render world และตัวละคร
- sync position/animation via server
- support private/public room

### 5.2 Server
- room/session manager
- world generator
- authoritative game state
- invite/permission control
- optional signaling for WebRTC ifต้องการ peer-hosted later

### 5.3 Database / Metadata
- เก็บ world metadata:
  - creator, mode, seed, template, privacy
  - active players, max players
  - world status: waiting, active, ended
- เก็บ avatar metadata แยกต่างหาก

## 6) ข้อดีของระบบแบบนี้
- ผู้เล่นไม่ต้องออกแบบ map เอง
- เล่นร่วมกันได้ทันทีทั้ง co-op และ PvP
- รองรับ private invite โดยไม่ต้องติดตั้งโปรแกรมเพิ่ม
- world สร้างอัตโนมัติและควบคุมคุณภาพได้ดี

## 7) ข้อจำกัดที่ควรระวัง
- world generator ต้องออกแบบให้สนุก และไม่ซ้ำซาก
- ถ้า public player count สูง ระบบต้องจัดการ load balancing
- private world ยังต้องมีระบบ invite/permission ให้ปลอดภัย

## 8) ถัดไปสำหรับโปรเจคนี้
- เริ่มที่ `session-based world` ก่อน แล้วค่อยขยายเป็น persistent save
- สร้าง `world creation UI` และ `room manager` เป็น priority
- เชื่อม `avatar metadata` กับ room state เพื่อเลี้ยงระบบตัวละคร
- เลือก `mode` ที่รองรับก่อน เช่น `co-op` และ `PvP` เป็นสองโหมดแรก

---

ไฟล์นี้เป็นแผน system-hosted world สำหรับเกม open-world ของคุณ — ถ้าต้องการผมช่วยต่อเป็น `architecture diagram` หรือ `data flow sheet` ได้เลย
