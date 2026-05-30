import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminService } from './admin.service';
import { AdminHospitalController } from './admin-hospital.controller';
import { AdminDepartmentController } from './admin-department.controller';
import { AdminReservationController } from './admin-reservation.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminHospitalController,
    AdminDepartmentController,
    AdminReservationController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
