import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcryptjs';

export class AddAuthAndSensorData1759401474766 implements MigrationInterface {
  name = 'AddAuthAndSensorData1759401474766';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL NOT NULL,
        "email" character varying NOT NULL,
        "password" character varying NOT NULL,
        "name" character varying NOT NULL,
        "role" character varying NOT NULL DEFAULT 'user',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // Create sensors table
    await queryRunner.query(`
      CREATE TABLE "sensors" (
        "id" SERIAL NOT NULL,
        "name" character varying NOT NULL,
        "type" character varying NOT NULL,
        "value" numeric(10,2),
        "unit" character varying,
        "status" character varying NOT NULL DEFAULT 'active',
        "room_id" integer,
        "latitude" numeric(10,6),
        "longitude" numeric(10,6),
        "last_reading" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sensors" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sensors_room" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE SET NULL
      )
    `);

    // Create residents table
    await queryRunner.query(`
      CREATE TABLE "residents" (
        "id" SERIAL NOT NULL,
        "name" character varying NOT NULL,
        "email" character varying NOT NULL,
        "phone" character varying,
        "apartment_id" integer,
        "type" character varying NOT NULL DEFAULT 'resident',
        "is_active" boolean NOT NULL DEFAULT true,
        "emergency_contact" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_resident_email" UNIQUE ("email"),
        CONSTRAINT "PK_residents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_residents_apartment" FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id") ON DELETE SET NULL
      )
    `);

    // Insert dummy users
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await queryRunner.query(`
      INSERT INTO "users" ("email", "password", "name", "role", "is_active")
      VALUES 
        ('admin@ignis.com', '${hashedPassword}', 'Admin User', 'admin', true),
        ('firefighter@ignis.com', '${hashedPassword}', 'Fire Fighter', 'firefighter', true),
        ('manager@ignis.com', '${hashedPassword}', 'Building Manager', 'manager', true)
    `);

    // Get some room IDs for sensor assignment
    const rooms = await queryRunner.query(`SELECT id FROM "room" LIMIT 10`);
    
    if (rooms.length > 0) {
      // Insert dummy sensors
      await queryRunner.query(`
        INSERT INTO "sensors" ("name", "type", "value", "unit", "status", "room_id", "latitude", "longitude", "last_reading")
        VALUES 
          ('Smoke Detector - Lobby', 'smoke', 0.5, 'ppm', 'active', ${rooms[0]?.id || 'NULL'}, 24.8607, 67.0011, NOW()),
          ('Temperature Sensor - Room 101', 'temperature', 22.5, '°C', 'active', ${rooms[1]?.id || 'NULL'}, 24.8608, 67.0012, NOW()),
          ('CO2 Sensor - Conference Room', 'gas', 420, 'ppm', 'active', ${rooms[2]?.id || 'NULL'}, 24.8609, 67.0013, NOW()),
          ('Smoke Detector - Corridor A', 'smoke', 0.3, 'ppm', 'active', ${rooms[3]?.id || 'NULL'}, 24.8610, 67.0014, NOW()),
          ('Temperature Sensor - Room 203', 'temperature', 24.8, '°C', 'alert', ${rooms[4]?.id || 'NULL'}, 24.8611, 67.0015, NOW()),
          ('Fire Alarm - Kitchen', 'smoke', 2.5, 'ppm', 'alert', ${rooms[5]?.id || 'NULL'}, 24.8612, 67.0016, NOW()),
          ('CO Sensor - Parking', 'gas', 15, 'ppm', 'active', ${rooms[6]?.id || 'NULL'}, 24.8613, 67.0017, NOW()),
          ('Smoke Detector - Stairwell', 'smoke', 0.2, 'ppm', 'active', ${rooms[7]?.id || 'NULL'}, 24.8614, 67.0018, NOW()),
          ('Temperature Sensor - Server Room', 'temperature', 18.5, '°C', 'active', ${rooms[8]?.id || 'NULL'}, 24.8615, 67.0019, NOW()),
          ('Humidity Sensor - Storage', 'humidity', 65, '%', 'inactive', ${rooms[9]?.id || 'NULL'}, 24.8616, 67.0020, NOW())
      `);
    }

    // Get some apartment IDs for resident assignment
    const apartments = await queryRunner.query(`SELECT id FROM "apartment" LIMIT 12`);
    
    if (apartments.length > 0) {
      // Insert dummy residents
      await queryRunner.query(`
        INSERT INTO "residents" ("name", "email", "phone", "apartment_id", "type", "is_active", "emergency_contact")
        VALUES 
          ('Ahmed Khan', 'ahmed.khan@example.com', '+92-300-1234567', ${apartments[0]?.id || 'NULL'}, 'resident', true, 'Ali Khan: +92-301-7654321'),
          ('Fatima Ali', 'fatima.ali@example.com', '+92-321-2345678', ${apartments[1]?.id || 'NULL'}, 'resident', true, 'Sara Ali: +92-322-8765432'),
          ('Hassan Raza', 'hassan.raza@example.com', '+92-333-3456789', ${apartments[2]?.id || 'NULL'}, 'owner', true, 'Bilal Raza: +92-334-9876543'),
          ('Ayesha Malik', 'ayesha.malik@example.com', '+92-300-4567890', ${apartments[3]?.id || 'NULL'}, 'resident', true, 'Usman Malik: +92-301-6543210'),
          ('Muhammad Tariq', 'muhammad.tariq@example.com', '+92-321-5678901', ${apartments[4]?.id || 'NULL'}, 'owner', true, 'Imran Tariq: +92-322-5432109'),
          ('Zainab Hussain', 'zainab.hussain@example.com', '+92-333-6789012', ${apartments[5]?.id || 'NULL'}, 'resident', true, 'Hina Hussain: +92-334-4321098'),
          ('Omar Farooq', 'omar.farooq@example.com', '+92-300-7890123', ${apartments[6]?.id || 'NULL'}, 'tenant', true, 'Yasir Farooq: +92-301-3210987'),
          ('Sana Ahmed', 'sana.ahmed@example.com', '+92-321-8901234', ${apartments[7]?.id || 'NULL'}, 'resident', true, 'Nadia Ahmed: +92-322-2109876'),
          ('Bilal Sheikh', 'bilal.sheikh@example.com', '+92-333-9012345', ${apartments[8]?.id || 'NULL'}, 'owner', true, 'Kamran Sheikh: +92-334-1098765'),
          ('Mariam Khan', 'mariam.khan@example.com', '+92-300-0123456', ${apartments[9]?.id || 'NULL'}, 'resident', true, 'Farah Khan: +92-301-0987654'),
          ('Ali Haider', 'ali.haider@example.com', '+92-321-1234560', ${apartments[10]?.id || 'NULL'}, 'tenant', true, 'Hamza Haider: +92-322-9876540'),
          ('Saba Qureshi', 'saba.qureshi@example.com', '+92-333-2345601', ${apartments[11]?.id || 'NULL'}, 'resident', true, 'Amna Qureshi: +92-334-8765401')
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints first
    await queryRunner.query(`ALTER TABLE "residents" DROP CONSTRAINT "FK_residents_apartment"`);
    await queryRunner.query(`ALTER TABLE "sensors" DROP CONSTRAINT "FK_sensors_room"`);
    
    // Drop tables
    await queryRunner.query(`DROP TABLE "residents"`);
    await queryRunner.query(`DROP TABLE "sensors"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
