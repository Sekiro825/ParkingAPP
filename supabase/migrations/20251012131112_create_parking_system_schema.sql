/*
  # Smart IoT Parking System - Database Schema

  ## Overview
  Creates the complete database schema for a smart parking system with admin and driver roles.

  ## 1. New Tables

  ### `profiles`
  Extends auth.users with role and profile information
  - `id` (uuid, primary key) - Links to auth.users
  - `role` (text) - Either 'admin' or 'driver'
  - `full_name` (text) - User's full name
  - `phone` (text) - Contact phone number
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last profile update

  ### `parking_slots`
  Represents physical parking spaces
  - `id` (uuid, primary key)
  - `slot_number` (text, unique) - Human-readable slot identifier (e.g., "A-101")
  - `zone` (text) - Parking zone/area (e.g., "Zone A", "Level 1")
  - `status` (text) - Current status: 'available', 'occupied', 'reserved', 'maintenance'
  - `slot_type` (text) - Type of slot: 'regular', 'disabled', 'ev_charging', 'compact'
  - `device_id` (uuid, nullable) - Linked ESP32 device
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `devices`
  ESP32 IoT devices monitoring parking slots
  - `id` (uuid, primary key)
  - `device_name` (text) - Friendly device name
  - `api_key` (text, unique) - Authentication key for device API calls
  - `slot_id` (uuid, nullable) - Currently assigned parking slot
  - `status` (text) - Device status: 'online', 'offline', 'error'
  - `last_seen` (timestamptz) - Last communication timestamp
  - `firmware_version` (text) - Current firmware version
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `reservations`
  Parking reservations made by drivers
  - `id` (uuid, primary key)
  - `slot_id` (uuid) - Reserved parking slot
  - `driver_id` (uuid) - Driver who made the reservation
  - `status` (text) - Reservation status: 'active', 'completed', 'cancelled', 'expired'
  - `reserved_at` (timestamptz) - When reservation was made
  - `expires_at` (timestamptz) - When reservation expires
  - `checked_in_at` (timestamptz, nullable) - When driver arrived
  - `checked_out_at` (timestamptz, nullable) - When driver left
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## 2. Security

  ### Row Level Security (RLS)
  All tables have RLS enabled with restrictive policies:

  #### profiles
  - Users can view their own profile
  - Users can update their own profile
  - Admins can view all profiles

  #### parking_slots
  - Drivers can view all slots (read-only)
  - Admins can manage slots (CRUD)

  #### devices
  - Drivers cannot access devices
  - Admins can manage devices (CRUD)

  #### reservations
  - Drivers can view their own reservations
  - Drivers can create reservations
  - Drivers can cancel their own active reservations
  - Admins can view all reservations

  ## 3. Important Notes

  - All timestamps use `timestamptz` for timezone-aware storage
  - Foreign keys use CASCADE for data integrity
  - Indexes added for frequently queried columns
  - Default values set for status fields to prevent null issues
  - API keys are generated using gen_random_uuid() for security
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'driver' CHECK (role IN ('admin', 'driver')),
  full_name text NOT NULL DEFAULT '',
  phone text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create parking_slots table
CREATE TABLE IF NOT EXISTS parking_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_number text UNIQUE NOT NULL,
  zone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
  slot_type text NOT NULL DEFAULT 'regular' CHECK (slot_type IN ('regular', 'disabled', 'ev_charging', 'compact')),
  device_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE parking_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view all slots"
  ON parking_slots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage slots"
  ON parking_slots FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create indexes for parking_slots
CREATE INDEX IF NOT EXISTS idx_parking_slots_status ON parking_slots(status);
CREATE INDEX IF NOT EXISTS idx_parking_slots_zone ON parking_slots(zone);

-- Create devices table
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name text NOT NULL,
  api_key text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  slot_id uuid REFERENCES parking_slots(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
  last_seen timestamptz DEFAULT now(),
  firmware_version text DEFAULT '1.0.0',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage devices"
  ON devices FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Add foreign key from parking_slots to devices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'parking_slots_device_id_fkey'
  ) THEN
    ALTER TABLE parking_slots
    ADD CONSTRAINT parking_slots_device_id_fkey
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create reservations table
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES parking_slots(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  reserved_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own reservations"
  ON reservations FOR SELECT
  TO authenticated
  USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can create reservations"
  ON reservations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can cancel own reservations"
  ON reservations FOR UPDATE
  TO authenticated
  USING (auth.uid() = driver_id AND status = 'active')
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Admins can view all reservations"
  ON reservations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create indexes for reservations
CREATE INDEX IF NOT EXISTS idx_reservations_driver_id ON reservations(driver_id);
CREATE INDEX IF NOT EXISTS idx_reservations_slot_id ON reservations(slot_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at') THEN
    CREATE TRIGGER update_profiles_updated_at
      BEFORE UPDATE ON profiles
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_parking_slots_updated_at') THEN
    CREATE TRIGGER update_parking_slots_updated_at
      BEFORE UPDATE ON parking_slots
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_devices_updated_at') THEN
    CREATE TRIGGER update_devices_updated_at
      BEFORE UPDATE ON devices
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_reservations_updated_at') THEN
    CREATE TRIGGER update_reservations_updated_at
      BEFORE UPDATE ON reservations
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;