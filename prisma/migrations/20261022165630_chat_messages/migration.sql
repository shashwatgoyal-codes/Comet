-- CreateEnum
CREATE TYPE "chat_role" AS ENUM ('rider', 'pilot');

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_role" "chat_role" NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "is_quick_reply" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_messages_ride_created_idx" ON "chat_messages"("ride_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_body_not_blank"
  CHECK (length(btrim("body")) > 0);
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
