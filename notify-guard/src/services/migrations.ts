import { dataSource } from '../db/data-source';
import { Bot, BotChat, Device, DevicePortMonitor } from '../db/entities';
import { ensureDevicePortRows } from './device-ports';

export async function migrateLegacyBotChats() {
    const botRepo = dataSource.getRepository(Bot);
    const botChatRepo = dataSource.getRepository(BotChat);

    const bots = await botRepo.find();
    for (const bot of bots) {
        if (!bot.chatId?.trim()) {
            continue;
        }

        const exists = await botChatRepo.findOneBy({
            botId: bot.id,
            chatId: bot.chatId.trim(),
        });

        if (exists) {
            continue;
        }

        await botChatRepo.save(botChatRepo.create({
            botId: bot.id,
            chatId: bot.chatId.trim(),
            isActive: bot.isActive,
        }));
    }
}

export async function migrateLegacyDevicePorts() {
    const deviceRepo = dataSource.getRepository(Device);
    const portRepo = dataSource.getRepository(DevicePortMonitor);

    const devices = await deviceRepo.find({ select: { id: true, monitorModbus: true } });
    const deviceIds = devices.map((device) => device.id);
    await ensureDevicePortRows(deviceIds);

    for (const device of devices) {
        const modbusPort = await portRepo.findOneBy({
            deviceId: device.id,
            port: 502,
        });

        if (!modbusPort) {
            continue;
        }

        if (modbusPort.monitorEnabled !== device.monitorModbus) {
            modbusPort.monitorEnabled = device.monitorModbus;
            await portRepo.save(modbusPort);
        }
    }
}
