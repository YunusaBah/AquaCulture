ALTER TABLE "DeviceSync" ADD COLUMN "clientId" TEXT;

CREATE UNIQUE INDEX "DeviceSync_userId_clientId_key"
ON "DeviceSync"("userId", "clientId");
