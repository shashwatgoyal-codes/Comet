-- CreateEnum
CREATE TYPE "place_label" AS ENUM ('home', 'work', 'other');

-- CreateTable
CREATE TABLE "saved_places" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" "place_label" NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "phone_e164" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_places_user_idx" ON "saved_places"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "emergency_contacts_user_idx" ON "emergency_contacts"("user_id");

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written below (docs/DATABASE.md).
CREATE UNIQUE INDEX "saved_places_one_home" ON "saved_places" ("user_id") WHERE "label" = 'home';
CREATE UNIQUE INDEX "saved_places_one_work" ON "saved_places" ("user_id") WHERE "label" = 'work';
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_in_india"
  CHECK ("lat" BETWEEN 6 AND 37 AND "lng" BETWEEN 68 AND 98);
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_phone_e164"
  CHECK ("phone_e164" ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE "saved_places" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_contacts" ENABLE ROW LEVEL SECURITY;
