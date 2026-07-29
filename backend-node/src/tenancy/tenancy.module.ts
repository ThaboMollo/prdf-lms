import { Global, Module } from '@nestjs/common';
import { TenantRegistryService } from './tenant-registry.service';
import { TenantResolverMiddleware } from './tenant-resolver.middleware';

/**
 * Global so the registry and resolver are available everywhere without each
 * feature module importing them — the tenant is ambient to every request, in
 * the same way DatabaseModule is.
 */
@Global()
@Module({
  providers: [TenantRegistryService, TenantResolverMiddleware],
  exports: [TenantRegistryService, TenantResolverMiddleware],
})
export class TenancyModule {}
