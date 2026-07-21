import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ProjectRoleGuard } from './project-role.guard';

@Global()
@Module({
  providers: [ProjectRoleGuard, AuditService],
  exports: [ProjectRoleGuard, AuditService],
})
export class RbacModule {}
