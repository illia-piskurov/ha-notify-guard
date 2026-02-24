import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryColumn,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('settings')
export class Setting {
    @PrimaryColumn({ type: 'text' })
    key!: string;

    @Column({ type: 'text' })
    value!: string;
}

@Entity('bots')
export class Bot {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'text' })
    name!: string;

    @Column({ type: 'text' })
    token!: string;

    @Column({ name: 'chat_id', type: 'text', default: '' })
    chatId!: string;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean;
}

@Entity('bot_chats')
export class BotChat {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ name: 'bot_id', type: 'integer' })
    botId!: number;

    @Column({ name: 'chat_id', type: 'text' })
    chatId!: string;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean;
}

@Entity('devices')
export class Device {
    @PrimaryColumn({ type: 'integer' })
    id!: number;

    @Column({ type: 'text' })
    name!: string;

    @Column({ type: 'text' })
    ip!: string;

    @Column({ name: 'has_modbus_tag', type: 'boolean', default: false })
    hasModbusTag!: boolean;

    @Column({ name: 'monitor_ping', type: 'boolean', default: false })
    monitorPing!: boolean;

    @Column({ name: 'monitor_modbus', type: 'boolean', default: false })
    monitorModbus!: boolean;

    @Column({ name: 'last_ping_status', type: 'text', default: 'unknown' })
    lastPingStatus!: string;

    @Column({ name: 'last_modbus_status', type: 'text', default: 'unknown' })
    lastModbusStatus!: string;

    @Column({ name: 'last_seen_at', type: 'datetime', nullable: true })
    lastSeenAt!: Date | null;
}

@Entity('device_notifications')
export class DeviceNotification {
    @PrimaryColumn({ name: 'device_id', type: 'integer' })
    deviceId!: number;

    @PrimaryColumn({ name: 'bot_id', type: 'integer' })
    botId!: number;
}

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ name: 'bot_id', type: 'integer' })
    botId!: number;

    @Column({ type: 'text' })
    token!: string;

    @Column({ name: 'chat_id', type: 'text' })
    chatId!: string;

    @Column({ type: 'text' })
    message!: string;

    @Column({ type: 'text', default: 'pending' })
    status!: 'pending' | 'failed' | 'sent';

    @Column({ type: 'integer', default: 0 })
    attempts!: number;

    @Column({ name: 'last_error', type: 'text', nullable: true })
    lastError!: string | null;

    @Column({ name: 'next_attempt_at', type: 'datetime', nullable: true })
    nextAttemptAt!: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;

    @Column({ name: 'sent_at', type: 'datetime', nullable: true })
    sentAt!: Date | null;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime', nullable: true })
    updatedAt!: Date | null;
}

@Entity('app_logs')
export class AppLog {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'text' })
    level!: 'info' | 'warn' | 'error';

    @Column({ type: 'text' })
    scope!: string;

    @Column({ type: 'text' })
    message!: string;

    @Column({ type: 'text', nullable: true })
    details!: string | null;

    @Column({ type: 'text', nullable: true })
    path!: string | null;

    @Column({ type: 'text', nullable: true })
    method!: string | null;

    @Column({ type: 'integer', nullable: true })
    status!: number | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;
}

@Entity('device_ping_history')
export class DevicePingHistory {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ name: 'device_id', type: 'integer' })
    deviceId!: number;

    @Column({ type: 'text' })
    status!: 'online' | 'offline';

    @CreateDateColumn({ name: 'checked_at', type: 'datetime' })
    checkedAt!: Date;
}

@Entity('device_alert_state')
export class DeviceAlertState {
    @PrimaryColumn({ name: 'device_id', type: 'integer' })
    deviceId!: number;

    @Column({ name: 'ping_down_sent', type: 'boolean', default: false })
    pingDownSent!: boolean;

    @Column({ name: 'modbus_down_sent', type: 'boolean', default: false })
    modbusDownSent!: boolean;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime', nullable: true })
    updatedAt!: Date | null;
}

export const ALL_ENTITIES = [
    Setting,
    Bot,
    BotChat,
    Device,
    DeviceNotification,
    Notification,
    AppLog,
    DevicePingHistory,
    DeviceAlertState,
] as const;
