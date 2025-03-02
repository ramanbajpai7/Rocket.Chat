import { Meteor } from 'meteor/meteor';
import { Match } from 'meteor/check';
import type { IRoom, IRoomWithRetentionPolicy, IUser } from '@rocket.chat/core-typings';
import { TEAM_TYPE } from '@rocket.chat/core-typings';
import { Team } from '@rocket.chat/core-services';
import type { ServerMethods } from '@rocket.chat/ui-contexts';
import { Rooms as RoomsAsync } from '@rocket.chat/models';

import { setRoomAvatar } from '../../../lib/server/functions/setRoomAvatar';
import { hasPermissionAsync } from '../../../authorization/server/functions/hasPermission';
import { Rooms } from '../../../models/server';
import { saveRoomName } from '../functions/saveRoomName';
import { saveRoomTopic } from '../functions/saveRoomTopic';
import { saveRoomAnnouncement } from '../functions/saveRoomAnnouncement';
import { saveRoomCustomFields } from '../functions/saveRoomCustomFields';
import { saveRoomDescription } from '../functions/saveRoomDescription';
import { saveRoomType } from '../functions/saveRoomType';
import { saveRoomReadOnly } from '../functions/saveRoomReadOnly';
import { saveReactWhenReadOnly } from '../functions/saveReactWhenReadOnly';
import { saveRoomSystemMessages } from '../functions/saveRoomSystemMessages';
import { saveRoomEncrypted } from '../functions/saveRoomEncrypted';
import { saveStreamingOptions } from '../functions/saveStreamingOptions';
import { roomCoordinator } from '../../../../server/lib/rooms/roomCoordinator';
import { RoomSettingsEnum } from '../../../../definition/IRoomTypeConfig';

type RoomSettings = {
	roomAvatar: string;
	featured: boolean;
	roomName: string | undefined;
	roomTopic: string;
	roomAnnouncement: unknown;
	roomCustomFields: unknown;
	roomDescription: unknown;
	roomType: unknown;
	readOnly: boolean;
	reactWhenReadOnly: boolean;
	systemMessages: string[];
	default: boolean;
	joinCode: string;
	streamingOptions: unknown;
	retentionEnabled: boolean;
	retentionMaxAge: number;
	retentionExcludePinned: boolean;
	retentionFilesOnly: boolean;
	retentionIgnoreThreads: boolean;
	retentionOverrideGlobal: boolean;
	encrypted: boolean;
	favorite: {
		favorite: boolean;
		defaultValue: boolean;
	};
};

type RoomSettingsValidators = {
	[TRoomSetting in keyof RoomSettings]?: (params: {
		userId: IUser['_id'];
		value: RoomSettings[TRoomSetting];
		room: IRoom;
		rid: IRoom['_id'];
	}) => Promise<void> | void;
};

const hasRetentionPolicy = (room: IRoom & { retention?: any }): room is IRoomWithRetentionPolicy =>
	'retention' in room && room.retention !== undefined;

const validators: RoomSettingsValidators = {
	async default({ userId }) {
		if (!(await hasPermissionAsync(userId, 'view-room-administration'))) {
			throw new Meteor.Error('error-action-not-allowed', 'Viewing room administration is not allowed', {
				method: 'saveRoomSettings',
				action: 'Viewing_room_administration',
			});
		}
	},
	async featured({ userId }) {
		if (!(await hasPermissionAsync(userId, 'view-room-administration'))) {
			throw new Meteor.Error('error-action-not-allowed', 'Viewing room administration is not allowed', {
				method: 'saveRoomSettings',
				action: 'Viewing_room_administration',
			});
		}
	},
	async roomType({ userId, room, value }) {
		if (value === room.t) {
			return;
		}

		if (value === 'c' && !(await hasPermissionAsync(userId, 'create-c'))) {
			throw new Meteor.Error('error-action-not-allowed', 'Changing a private group to a public channel is not allowed', {
				method: 'saveRoomSettings',
				action: 'Change_Room_Type',
			});
		}

		if (value === 'p' && !(await hasPermissionAsync(userId, 'create-p'))) {
			throw new Meteor.Error('error-action-not-allowed', 'Changing a public channel to a private room is not allowed', {
				method: 'saveRoomSettings',
				action: 'Change_Room_Type',
			});
		}
	},
	async encrypted({ userId, value, room, rid }) {
		if (value !== room.encrypted) {
			if (!(await roomCoordinator.getRoomDirectives(room.t).allowRoomSettingChange(room, RoomSettingsEnum.E2E))) {
				throw new Meteor.Error('error-action-not-allowed', 'Only groups or direct channels can enable encryption', {
					method: 'saveRoomSettings',
					action: 'Change_Room_Encrypted',
				});
			}

			if (room.t !== 'd' && !(await hasPermissionAsync(userId, 'toggle-room-e2e-encryption', rid))) {
				throw new Meteor.Error('error-action-not-allowed', 'You do not have permission to toggle E2E encryption', {
					method: 'saveRoomSettings',
					action: 'Change_Room_Encrypted',
				});
			}
		}
	},
	async retentionEnabled({ userId, value, room, rid }) {
		if (!hasRetentionPolicy(room)) {
			throw new Meteor.Error('error-action-not-allowed', 'Room does not have retention policy', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}

		if (!(await hasPermissionAsync(userId, 'edit-room-retention-policy', rid)) && value !== room.retention.enabled) {
			throw new Meteor.Error('error-action-not-allowed', 'Editing room retention policy is not allowed', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}
	},
	async retentionMaxAge({ userId, value, room, rid }) {
		if (!hasRetentionPolicy(room)) {
			throw new Meteor.Error('error-action-not-allowed', 'Room does not have retention policy', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}

		if (!(await hasPermissionAsync(userId, 'edit-room-retention-policy', rid)) && value !== room.retention.maxAge) {
			throw new Meteor.Error('error-action-not-allowed', 'Editing room retention policy is not allowed', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}
	},
	async retentionExcludePinned({ userId, value, room, rid }) {
		if (!hasRetentionPolicy(room)) {
			throw new Meteor.Error('error-action-not-allowed', 'Room does not have retention policy', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}

		if (!(await hasPermissionAsync(userId, 'edit-room-retention-policy', rid)) && value !== room.retention.excludePinned) {
			throw new Meteor.Error('error-action-not-allowed', 'Editing room retention policy is not allowed', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}
	},
	async retentionFilesOnly({ userId, value, room, rid }) {
		if (!hasRetentionPolicy(room)) {
			throw new Meteor.Error('error-action-not-allowed', 'Room does not have retention policy', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}

		if (!(await hasPermissionAsync(userId, 'edit-room-retention-policy', rid)) && value !== room.retention.filesOnly) {
			throw new Meteor.Error('error-action-not-allowed', 'Editing room retention policy is not allowed', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}
	},
	async retentionIgnoreThreads({ userId, value, room, rid }) {
		if (!hasRetentionPolicy(room)) {
			throw new Meteor.Error('error-action-not-allowed', 'Room does not have retention policy', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}

		if (!(await hasPermissionAsync(userId, 'edit-room-retention-policy', rid)) && value !== room.retention.ignoreThreads) {
			throw new Meteor.Error('error-action-not-allowed', 'Editing room retention policy is not allowed', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}
	},
	async roomAvatar({ userId, rid }) {
		if (!(await hasPermissionAsync(userId, 'edit-room-avatar', rid))) {
			throw new Meteor.Error('error-action-not-allowed', 'Editing a room avatar is not allowed', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}
	},
};

type RoomSettingsSavers = {
	[TRoomSetting in keyof RoomSettings]?: (params: {
		userId: IUser['_id'];
		user: IUser & Required<Pick<IUser, 'username' | 'name'>>;
		value: RoomSettings[TRoomSetting];
		room: IRoom;
		rid: IRoom['_id'];
	}) => void | Promise<void>;
};

const settingSavers: RoomSettingsSavers = {
	async roomName({ value, rid, user, room }) {
		if (!(await saveRoomName(rid, value, user))) {
			return;
		}

		if (room.teamId && room.teamMain) {
			void Team.update(user._id, room.teamId, {
				type: room.t === 'c' ? TEAM_TYPE.PUBLIC : TEAM_TYPE.PRIVATE,
				name: value,
				updateRoom: false,
			});
		}
	},
	async roomTopic({ value, room, rid, user }) {
		if (!value && !room.topic) {
			return;
		}
		if (value !== room.topic) {
			await saveRoomTopic(rid, value, user);
		}
	},
	async roomAnnouncement({ value, room, rid, user }) {
		if (!value && !room.announcement) {
			return;
		}
		if (value !== room.announcement) {
			await saveRoomAnnouncement(rid, value, user);
		}
	},
	async roomCustomFields({ value, room, rid }) {
		if (value !== room.customFields) {
			await saveRoomCustomFields(rid, value);
		}
	},
	async roomDescription({ value, room, rid, user }) {
		if (!value && !room.description) {
			return;
		}
		if (value !== room.description) {
			await saveRoomDescription(rid, value, user);
		}
	},
	async roomType({ value, room, rid, user }) {
		if (value === room.t) {
			return;
		}

		if (!(await saveRoomType(rid, value, user))) {
			return;
		}

		if (room.teamId && room.teamMain) {
			const type = value === 'c' ? TEAM_TYPE.PUBLIC : TEAM_TYPE.PRIVATE;
			void Team.update(user._id, room.teamId, { type, updateRoom: false });
		}
	},
	async streamingOptions({ value, rid }) {
		await saveStreamingOptions(rid, value);
	},
	async readOnly({ value, room, rid, user }) {
		if (value !== room.ro) {
			await saveRoomReadOnly(rid, value, user);
		}
	},
	async reactWhenReadOnly({ value, room, rid, user }) {
		if (value !== room.reactWhenReadOnly) {
			await saveReactWhenReadOnly(rid, value, user);
		}
	},
	async systemMessages({ value, room, rid }) {
		if (JSON.stringify(value) !== JSON.stringify(room.sysMes)) {
			await saveRoomSystemMessages(rid, value);
		}
	},
	async joinCode({ value, rid }) {
		await RoomsAsync.setJoinCodeById(rid, String(value));
	},
	async default({ value, rid }) {
		await RoomsAsync.saveDefaultById(rid, value);
	},
	async featured({ value, rid }) {
		await RoomsAsync.saveFeaturedById(rid, value);
	},
	async retentionEnabled({ value, rid }) {
		await RoomsAsync.saveRetentionEnabledById(rid, value);
	},
	async retentionMaxAge({ value, rid }) {
		await RoomsAsync.saveRetentionMaxAgeById(rid, value);
	},
	async retentionExcludePinned({ value, rid }) {
		await RoomsAsync.saveRetentionExcludePinnedById(rid, value);
	},
	async retentionFilesOnly({ value, rid }) {
		await RoomsAsync.saveRetentionFilesOnlyById(rid, value);
	},
	async retentionIgnoreThreads({ value, rid }) {
		await RoomsAsync.saveRetentionIgnoreThreadsById(rid, value);
	},
	async retentionOverrideGlobal({ value, rid }) {
		await RoomsAsync.saveRetentionOverrideGlobalById(rid, value);
	},
	async encrypted({ value, room, rid, user }) {
		await saveRoomEncrypted(rid, value, user, Boolean(room.encrypted) !== Boolean(value));
	},
	async favorite({ value, rid }) {
		await RoomsAsync.saveFavoriteById(rid, value.favorite, value.defaultValue);
	},
	async roomAvatar({ value, rid, user }) {
		await setRoomAvatar(rid, value, user);
	},
};

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		saveRoomSettings(rid: IRoom['_id'], settings: Partial<RoomSettings>): Promise<{ result: true; rid: IRoom['_id'] }>;
		saveRoomSettings<RoomSettingName extends keyof RoomSettings>(
			rid: IRoom['_id'],
			setting: RoomSettingName,
			value: RoomSettings[RoomSettingName],
		): Promise<{ result: true; rid: IRoom['_id'] }>;
	}
}

const fields: (keyof RoomSettings)[] = [
	'roomAvatar',
	'featured',
	'roomName',
	'roomTopic',
	'roomAnnouncement',
	'roomCustomFields',
	'roomDescription',
	'roomType',
	'readOnly',
	'reactWhenReadOnly',
	'systemMessages',
	'default',
	'joinCode',
	'streamingOptions',
	'retentionEnabled',
	'retentionMaxAge',
	'retentionExcludePinned',
	'retentionFilesOnly',
	'retentionIgnoreThreads',
	'retentionOverrideGlobal',
	'encrypted',
	'favorite',
];

const validate = <TRoomSetting extends keyof RoomSettings>(
	setting: TRoomSetting,
	params: {
		userId: IUser['_id'];
		value: RoomSettings[TRoomSetting];
		room: IRoom;
		rid: IRoom['_id'];
	},
) => {
	const validator = validators[setting];
	return validator?.(params);
};

async function save<TRoomSetting extends keyof RoomSettings>(
	setting: TRoomSetting,
	params: {
		userId: IUser['_id'];
		user: IUser & Required<Pick<IUser, 'username' | 'name'>>;
		value: RoomSettings[TRoomSetting];
		room: IRoom;
		rid: IRoom['_id'];
	},
) {
	const saver = settingSavers[setting];
	await saver?.(params);
}

async function saveRoomSettings(rid: IRoom['_id'], settings: Partial<RoomSettings>): Promise<{ result: true; rid: IRoom['_id'] }>;
async function saveRoomSettings<RoomSettingName extends keyof RoomSettings>(
	rid: IRoom['_id'],
	setting: RoomSettingName,
	value: RoomSettings[RoomSettingName],
): Promise<{ result: true; rid: IRoom['_id'] }>;
async function saveRoomSettings(
	rid: IRoom['_id'],
	settings: Partial<RoomSettings> | keyof RoomSettings,
	value?: RoomSettings[keyof RoomSettings],
): Promise<{ result: true; rid: IRoom['_id'] }> {
	const uid = Meteor.userId();

	if (!uid) {
		throw new Meteor.Error('error-invalid-user', 'Invalid user', {
			function: 'RocketChat.saveRoomName',
		});
	}
	if (!Match.test(rid, String)) {
		throw new Meteor.Error('error-invalid-room', 'Invalid room', {
			method: 'saveRoomSettings',
		});
	}

	if (typeof settings !== 'object') {
		settings = {
			[settings]: value,
		};
	}

	if (!Object.keys(settings).every((key) => fields.includes(key as keyof typeof settings))) {
		throw new Meteor.Error('error-invalid-settings', 'Invalid settings provided', {
			method: 'saveRoomSettings',
		});
	}

	const room = Rooms.findOneById(rid) as IRoom | undefined;

	if (!room) {
		throw new Meteor.Error('error-invalid-room', 'Invalid room', {
			method: 'saveRoomSettings',
		});
	}

	if (!(await hasPermissionAsync(uid, 'edit-room', rid))) {
		if (!(Object.keys(settings).includes('encrypted') && room.t === 'd')) {
			throw new Meteor.Error('error-action-not-allowed', 'Editing room is not allowed', {
				method: 'saveRoomSettings',
				action: 'Editing_room',
			});
		}
		settings = { encrypted: settings.encrypted };
	}

	if (room.broadcast && (settings.readOnly || settings.reactWhenReadOnly)) {
		throw new Meteor.Error('error-action-not-allowed', 'Editing readOnly/reactWhenReadOnly are not allowed for broadcast rooms', {
			method: 'saveRoomSettings',
			action: 'Editing_room',
		});
	}

	const user = (await Meteor.userAsync()) as (IUser & Required<Pick<IUser, 'username' | 'name'>>) | null;
	if (!user) {
		throw new Meteor.Error('error-invalid-user', 'Invalid user', {
			method: 'saveRoomSettings',
		});
	}

	// validations
	for await (const setting of Object.keys(settings) as (keyof RoomSettings)[]) {
		await validate(setting, {
			userId: uid,
			value: settings[setting],
			room,
			rid,
		});

		if (setting === 'retentionOverrideGlobal') {
			delete settings.retentionMaxAge;
			delete settings.retentionExcludePinned;
			delete settings.retentionFilesOnly;
			delete settings.retentionIgnoreThreads;
		}
	}

	// saving data
	for await (const setting of Object.keys(settings) as (keyof RoomSettings)[]) {
		await save(setting, {
			userId: uid,
			user,
			value: settings[setting],
			room,
			rid,
		});
	}

	return {
		result: true,
		rid: room._id,
	};
}

Meteor.methods<ServerMethods>({
	saveRoomSettings,
});
