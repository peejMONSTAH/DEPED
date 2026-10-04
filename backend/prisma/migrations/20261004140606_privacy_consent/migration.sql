-- Evidence that a person read a version of the Privacy Notice.
-- CreateTable
CREATE TABLE "privacy_consents" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "notice_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "privacy_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "privacy_consents_user_id_notice_version_key" ON "privacy_consents"("user_id", "notice_version");

-- AddForeignKey
ALTER TABLE "privacy_consents" ADD CONSTRAINT "privacy_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
