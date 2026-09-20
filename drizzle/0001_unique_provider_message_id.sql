-- Dry-run batches used to number their message ids from zero each time, so the same id could
-- land on several messages. A delivery report finds its message by that id, which meant one
-- bounce could mark unrelated emails as bounced. Make any existing duplicates unique before
-- the constraint goes on, so this is safe on a database that already has sends in it.
UPDATE "messages" m
   SET "provider_message_id" = m."provider_message_id" || '-' || m."id"
  FROM (
    SELECT "provider_message_id"
      FROM "messages"
     WHERE "provider_message_id" IS NOT NULL
     GROUP BY "provider_message_id"
    HAVING count(*) > 1
  ) dup
 WHERE m."provider_message_id" = dup."provider_message_id";
--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_message_id_uniq" ON "messages" USING btree ("provider_message_id");
