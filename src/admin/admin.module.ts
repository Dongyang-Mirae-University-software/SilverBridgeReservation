import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminService } from './admin.service';
import { AdminHospitalController } from './admin-hospital.controller';
import { AdminDepartmentController } from './admin-department.controller';
import { AdminReservationController } from './admin-reservation.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminLogsController } from './admin-logs.controller';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminHospitalController,
    AdminDepartmentController,
    AdminReservationController,
    AdminDashboardController,
    AdminLogsController,
    AdminUsersController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
