-- ============================================
-- Digital Twin of Locomotive — TimescaleDB Schema
-- ============================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================
-- 1. telemetry_raw (hypertable)
-- ============================================
CREATE TABLE IF NOT EXISTS telemetry_raw (
    ts            TIMESTAMPTZ    NOT NULL,
    loco_id       VARCHAR(32)    NOT NULL,
    loco_type     VARCHAR(16)    NOT NULL,
    parameter     VARCHAR(64)    NOT NULL,
    value_raw     DOUBLE PRECISION,
    value_smooth  DOUBLE PRECISION,
    unit          VARCHAR(16),
    quality       SMALLINT       DEFAULT 0  -- 0=ok, 1=interpolated, 2=outlier
);

SELECT create_hypertable('telemetry_raw', 'ts', chunk_time_interval => INTERVAL '1 hour');
CREATE INDEX idx_telemetry_loco_param_ts ON telemetry_raw (loco_id, parameter, ts DESC);

-- ============================================
-- 2. health_index_history (hypertable)
-- ============================================
CREATE TABLE IF NOT EXISTS health_index_history (
    ts               TIMESTAMPTZ    NOT NULL,
    loco_id          VARCHAR(32)    NOT NULL,
    score            DOUBLE PRECISION NOT NULL,
    status           VARCHAR(16)    NOT NULL,
    top_factors      JSONB,
    subsystem_scores JSONB
);

SELECT create_hypertable('health_index_history', 'ts', chunk_time_interval => INTERVAL '1 hour');
CREATE INDEX idx_hi_loco_ts ON health_index_history (loco_id, ts DESC);

-- ============================================
-- 3. alerts
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
    id            BIGSERIAL      PRIMARY KEY,
    ts            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    loco_id       VARCHAR(32)    NOT NULL,
    parameter     VARCHAR(64)    NOT NULL,
    severity      VARCHAR(16)    NOT NULL,  -- info | warning | critical
    value         DOUBLE PRECISION,
    threshold     DOUBLE PRECISION,
    message       TEXT,
    acknowledged  BOOLEAN        DEFAULT FALSE,
    annotation    TEXT
);

CREATE INDEX idx_alerts_loco_ts_sev ON alerts (loco_id, ts DESC, severity);

-- ============================================
-- 4. loco_config
-- ============================================
CREATE TABLE IF NOT EXISTS loco_config (
    loco_type   VARCHAR(16)    PRIMARY KEY,
    config      JSONB          NOT NULL,
    updated_at  TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================
-- 5. users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id             SERIAL         PRIMARY KEY,
    username       VARCHAR(64)    UNIQUE NOT NULL,
    password_hash  VARCHAR(256)   NOT NULL,
    role           VARCHAR(16)    NOT NULL  -- admin | dispatcher | cabin
);

-- ============================================
-- Seed: Demo users (bcrypt hashes)
-- admin123  => $2b$12$SSmdD2fVtuTMhrSRa5AKBuJ1jTaIvpj94eCOPFA/7KgXxrYH6Kgbm
-- disp123   => $2b$12$aGamdxlY7ZSvhrrY89Hg9Oh.T/XKc0kc3XSHTchETUANURLY0JsqW
-- cabin123  => $2b$12$wwu7H2uSyExpbhH3r2tWd.eRLXEICy6P.FdB02mZ1LjVSG.ubzWj6
-- ============================================
INSERT INTO users (username, password_hash, role) VALUES
    ('admin',      '$2b$12$SSmdD2fVtuTMhrSRa5AKBuJ1jTaIvpj94eCOPFA/7KgXxrYH6Kgbm', 'admin'),
    ('dispatcher', '$2b$12$aGamdxlY7ZSvhrrY89Hg9Oh.T/XKc0kc3XSHTchETUANURLY0JsqW', 'dispatcher'),
    ('cabin',      '$2b$12$wwu7H2uSyExpbhH3r2tWd.eRLXEICy6P.FdB02mZ1LjVSG.ubzWj6', 'cabin')
ON CONFLICT (username) DO NOTHING;

-- ============================================
-- Seed: Locomotive configurations
-- KZ8A — Electric locomotive
-- ============================================
INSERT INTO loco_config (loco_type, config) VALUES
('KZ8A', '{
    "name": "KZ8A Electric Locomotive",
    "subsystems": {
        "Traction": {
            "weight": 0.30,
            "parameters": {
                "traction_motor_current_a": {
                    "unit": "A",
                    "safe_low": 0, "safe_high": 1080,
                    "warn_low": -1, "warn_high": 1200,
                    "crit_low": -1, "crit_high": 1320,
                    "weight": 0.10,
                    "nominal": 600, "sigma": 50
                },
                "traction_motor_temp_c": {
                    "unit": "°C",
                    "safe_low": 20, "safe_high": 120,
                    "warn_low": 10, "warn_high": 140,
                    "crit_low": 0, "crit_high": 155,
                    "weight": 0.10,
                    "nominal": 85, "sigma": 5
                },
                "dc_bus_voltage_v": {
                    "unit": "V",
                    "safe_low": 1620, "safe_high": 1980,
                    "warn_low": 1530, "warn_high": 2070,
                    "crit_low": 1440, "crit_high": 2160,
                    "weight": 0.05,
                    "nominal": 1800, "sigma": 20
                },
                "wheel_slip_pct": {
                    "unit": "%",
                    "safe_low": 0, "safe_high": 2,
                    "warn_low": 0, "warn_high": 5,
                    "crit_low": 0, "crit_high": 10,
                    "weight": 0.05,
                    "nominal": 0.5, "sigma": 0.3
                }
            }
        },
        "Electrical": {
            "weight": 0.25,
            "parameters": {
                "catenary_voltage_kv": {
                    "unit": "kV",
                    "safe_low": 22.5, "safe_high": 27.5,
                    "warn_low": 19, "warn_high": 29,
                    "crit_low": 17, "crit_high": 31,
                    "weight": 0.08,
                    "nominal": 25, "sigma": 0.5
                },
                "onboard_voltage_v": {
                    "unit": "V",
                    "safe_low": 380, "safe_high": 420,
                    "warn_low": 360, "warn_high": 440,
                    "crit_low": 340, "crit_high": 460,
                    "weight": 0.05,
                    "nominal": 400, "sigma": 5
                },
                "battery_voltage_v": {
                    "unit": "V",
                    "safe_low": 100, "safe_high": 130,
                    "warn_low": 90, "warn_high": 135,
                    "crit_low": 80, "crit_high": 140,
                    "weight": 0.05,
                    "nominal": 110, "sigma": 2
                },
                "pantograph_current_a": {
                    "unit": "A",
                    "safe_low": 0, "safe_high": 500,
                    "warn_low": -1, "warn_high": 600,
                    "crit_low": -1, "crit_high": 700,
                    "weight": 0.07,
                    "nominal": 300, "sigma": 30
                }
            }
        },
        "Braking": {
            "weight": 0.25,
            "parameters": {
                "brake_main_pressure_bar": {
                    "unit": "bar",
                    "safe_low": 4.5, "safe_high": 6.2,
                    "warn_low": 3.8, "warn_high": 6.5,
                    "crit_low": 2.8, "crit_high": 7.0,
                    "weight": 0.10,
                    "nominal": 5.2, "sigma": 0.15
                },
                "brake_reservoir_pressure_bar": {
                    "unit": "bar",
                    "safe_low": 8.0, "safe_high": 9.5,
                    "warn_low": 7.5, "warn_high": 10.0,
                    "crit_low": 7.0, "crit_high": 10.5,
                    "weight": 0.05,
                    "nominal": 8.8, "sigma": 0.1
                },
                "brake_cylinder_pressure_bar": {
                    "unit": "bar",
                    "safe_low": 0, "safe_high": 4.0,
                    "warn_low": 0, "warn_high": 4.5,
                    "crit_low": 0, "crit_high": 5.0,
                    "weight": 0.05,
                    "nominal": 0.5, "sigma": 0.2
                },
                "regen_braking_power_kw": {
                    "unit": "kW",
                    "safe_low": 0, "safe_high": 7600,
                    "warn_low": 0, "warn_high": 8000,
                    "crit_low": 0, "crit_high": 8500,
                    "weight": 0.05,
                    "nominal": 3000, "sigma": 200
                }
            }
        },
        "Cooling": {
            "weight": 0.10,
            "parameters": {
                "coolant_temp_c": {
                    "unit": "°C",
                    "safe_low": 60, "safe_high": 85,
                    "warn_low": 50, "warn_high": 95,
                    "crit_low": 40, "crit_high": 105,
                    "weight": 0.05,
                    "nominal": 75, "sigma": 3
                },
                "oil_temp_c": {
                    "unit": "°C",
                    "safe_low": 60, "safe_high": 95,
                    "warn_low": 50, "warn_high": 105,
                    "crit_low": 40, "crit_high": 115,
                    "weight": 0.05,
                    "nominal": 80, "sigma": 3
                }
            }
        },
        "Speed": {
            "weight": 0.10,
            "parameters": {
                "speed_kmh": {
                    "unit": "km/h",
                    "safe_low": 0, "safe_high": 115,
                    "warn_low": 0, "warn_high": 120,
                    "crit_low": 0, "crit_high": 130,
                    "weight": 0.05,
                    "nominal": 70, "sigma": 5
                },
                "ambient_temp_c": {
                    "unit": "°C",
                    "safe_low": -40, "safe_high": 40,
                    "warn_low": -50, "warn_high": 45,
                    "crit_low": -55, "crit_high": 50,
                    "weight": 0.05,
                    "nominal": 20, "sigma": 1
                }
            }
        }
    }
}')
ON CONFLICT (loco_type) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();

-- ============================================
-- Seed: TE33A — Diesel-electric locomotive
-- ============================================
INSERT INTO loco_config (loco_type, config) VALUES
('TE33A', '{
    "name": "TE33A Diesel-Electric Locomotive",
    "subsystems": {
        "Diesel": {
            "weight": 0.30,
            "parameters": {
                "coolant_temp_c": {
                    "unit": "°C",
                    "safe_low": 82, "safe_high": 95,
                    "warn_low": 60, "warn_high": 105,
                    "crit_low": 50, "crit_high": 115,
                    "weight": 0.15,
                    "nominal": 88, "sigma": 2
                },
                "oil_temp_c": {
                    "unit": "°C",
                    "safe_low": 90, "safe_high": 105,
                    "warn_low": 80, "warn_high": 115,
                    "crit_low": 70, "crit_high": 125,
                    "weight": 0.12,
                    "nominal": 97, "sigma": 2
                },
                "oil_pressure_kpa": {
                    "unit": "kPa",
                    "safe_low": 310, "safe_high": 380,
                    "warn_low": 210, "warn_high": 420,
                    "crit_low": 140, "crit_high": 480,
                    "weight": 0.12,
                    "nominal": 345, "sigma": 10
                },
                "engine_rpm": {
                    "unit": "RPM",
                    "safe_low": 450, "safe_high": 1050,
                    "warn_low": 400, "warn_high": 1100,
                    "crit_low": 350, "crit_high": 1150,
                    "weight": 0.05,
                    "nominal": 750, "sigma": 20
                },
                "exhaust_temp_c": {
                    "unit": "°C",
                    "safe_low": 200, "safe_high": 500,
                    "warn_low": 150, "warn_high": 550,
                    "crit_low": 100, "crit_high": 600,
                    "weight": 0.08,
                    "nominal": 400, "sigma": 15
                },
                "fuel_level_pct": {
                    "unit": "%",
                    "safe_low": 20, "safe_high": 100,
                    "warn_low": 10, "warn_high": 100,
                    "crit_low": 5, "crit_high": 100,
                    "weight": 0.05,
                    "nominal": 75, "sigma": 0.1
                },
                "fuel_consumption_g_kwh": {
                    "unit": "g/kWh",
                    "safe_low": 160, "safe_high": 220,
                    "warn_low": 140, "warn_high": 253,
                    "crit_low": 120, "crit_high": 280,
                    "weight": 0.03,
                    "nominal": 192, "sigma": 5
                }
            }
        },
        "Traction": {
            "weight": 0.25,
            "parameters": {
                "traction_motor_current_a": {
                    "unit": "A",
                    "safe_low": 0, "safe_high": 900,
                    "warn_low": -1, "warn_high": 1000,
                    "crit_low": -1, "crit_high": 1100,
                    "weight": 0.10,
                    "nominal": 500, "sigma": 40
                },
                "traction_motor_temp_c": {
                    "unit": "°C",
                    "safe_low": 20, "safe_high": 120,
                    "warn_low": 10, "warn_high": 140,
                    "crit_low": 0, "crit_high": 155,
                    "weight": 0.10,
                    "nominal": 85, "sigma": 5
                },
                "wheel_slip_pct": {
                    "unit": "%",
                    "safe_low": 0, "safe_high": 2,
                    "warn_low": 0, "warn_high": 5,
                    "crit_low": 0, "crit_high": 10,
                    "weight": 0.05,
                    "nominal": 0.5, "sigma": 0.3
                }
            }
        },
        "Braking": {
            "weight": 0.25,
            "parameters": {
                "brake_main_pressure_bar": {
                    "unit": "bar",
                    "safe_low": 4.5, "safe_high": 6.2,
                    "warn_low": 3.8, "warn_high": 6.5,
                    "crit_low": 2.8, "crit_high": 7.0,
                    "weight": 0.10,
                    "nominal": 5.2, "sigma": 0.15
                },
                "brake_reservoir_pressure_bar": {
                    "unit": "bar",
                    "safe_low": 8.0, "safe_high": 9.5,
                    "warn_low": 7.5, "warn_high": 10.0,
                    "crit_low": 7.0, "crit_high": 10.5,
                    "weight": 0.05,
                    "nominal": 8.8, "sigma": 0.1
                },
                "brake_cylinder_pressure_bar": {
                    "unit": "bar",
                    "safe_low": 0, "safe_high": 4.0,
                    "warn_low": 0, "warn_high": 4.5,
                    "crit_low": 0, "crit_high": 5.0,
                    "weight": 0.05,
                    "nominal": 0.5, "sigma": 0.2
                },
                "regen_braking_power_kw": {
                    "unit": "kW",
                    "safe_low": 0, "safe_high": 3000,
                    "warn_low": 0, "warn_high": 3200,
                    "crit_low": 0, "crit_high": 3500,
                    "weight": 0.05,
                    "nominal": 1500, "sigma": 100
                }
            }
        },
        "Speed": {
            "weight": 0.10,
            "parameters": {
                "speed_kmh": {
                    "unit": "km/h",
                    "safe_low": 0, "safe_high": 115,
                    "warn_low": 0, "warn_high": 120,
                    "crit_low": 0, "crit_high": 130,
                    "weight": 0.05,
                    "nominal": 60, "sigma": 5
                },
                "ambient_temp_c": {
                    "unit": "°C",
                    "safe_low": -40, "safe_high": 45,
                    "warn_low": -50, "warn_high": 50,
                    "crit_low": -55, "crit_high": 55,
                    "weight": 0.05,
                    "nominal": 20, "sigma": 1
                }
            }
        },
        "Auxiliary": {
            "weight": 0.10,
            "parameters": {
                "dc_bus_voltage_v": {
                    "unit": "V",
                    "safe_low": 900, "safe_high": 1200,
                    "warn_low": 800, "warn_high": 1300,
                    "crit_low": 700, "crit_high": 1400,
                    "weight": 0.05,
                    "nominal": 1050, "sigma": 15
                },
                "oil_pressure_idle_kpa": {
                    "unit": "kPa",
                    "safe_low": 100, "safe_high": 210,
                    "warn_low": 70, "warn_high": 250,
                    "crit_low": 50, "crit_high": 300,
                    "weight": 0.05,
                    "nominal": 155, "sigma": 10
                }
            }
        }
    }
}')
ON CONFLICT (loco_type) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();

-- ============================================
-- Retention policy: 72 hours
-- ============================================
SELECT add_retention_policy('telemetry_raw', INTERVAL '72 hours', if_not_exists => TRUE);
SELECT add_retention_policy('health_index_history', INTERVAL '72 hours', if_not_exists => TRUE);
