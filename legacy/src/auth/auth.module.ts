import { Module } from "@nestjs/common";
import { IDENTITY_PROVIDER } from "./domain/identity-provider.port";
import { MainApiIdentityAdapter } from "./infrastructure/main-api-identity.adapter";
import { SessionController } from "./infrastructure/http/session.controller";
import { AuthGuard } from "./infrastructure/auth.guard";

@Module({
  controllers: [SessionController],
  providers: [{ provide: IDENTITY_PROVIDER, useClass: MainApiIdentityAdapter }, AuthGuard],
  exports: [IDENTITY_PROVIDER, AuthGuard],
})
export class AuthModule {}
