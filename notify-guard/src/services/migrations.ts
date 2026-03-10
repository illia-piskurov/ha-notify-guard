import { dataSource } from '../db/data-source';
import { BotChat, Chat, Device, DevicePortMonitor } from '../db/entities';
import { ensureDevicePortRows } from './device-ports';

export async function migrateLegacyBotChats() {
    const botChatRepo = dataSource.getRepository(BotChat);
    const chatRepo = dataSource.getRepository(Chat);

    const existingCatalog = await chatRepo.find();
    const catalogByChatId = new Map(existingCatalog.map((chat) => [chat.chatId.trim(), chat]));

    const botChats = await botChatRepo.find();
    for (const botChat of botChats) {
        if (botChat.chatRefId) {
            continue;
        }

        const normalizedChatId = botChat.chatId?.trim();
        if (!normalizedChatId) {
            continue;
        }

        let catalogChat = catalogByChatId.get(normalizedChatId);
        if (!catalogChat) {
            catalogChat = await chatRepo.save(chatRepo.create({
                chatId: normalizedChatId,
                name: normalizedChatId,
                isActive: true,
            }));
            catalogByChatId.set(normalizedChatId, catalogChat);
        }

        botChat.chatRefId = catalogChat.id;
        await botChatRepo.save(botChat);
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
