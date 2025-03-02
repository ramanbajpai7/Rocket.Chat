/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { IMessage } from '@rocket.chat/core-typings';
import { Messages as MessagesRaw, VideoConference, LivechatDepartmentAgents, Rooms } from '@rocket.chat/models';

import { _setUsername } from './setUsername';
import { _setRealName } from './setRealName';
import { Messages, Subscriptions, Users } from '../../../models/server';
import { FileUpload } from '../../../file-upload/server';
import { updateGroupDMsName } from './updateGroupDMsName';
import { validateName } from './validateName';

/**
 *
 * @param {object} changes changes to the user
 */

export async function saveUserIdentity({ _id, name: rawName, username: rawUsername }: { _id: string; name?: string; username?: string }) {
	if (!_id) {
		return false;
	}

	const name = String(rawName).trim();
	const username = String(rawUsername).trim();

	const user = Users.findOneById(_id);

	const previousUsername = user.username;
	const previousName = user.name;
	const nameChanged = previousName !== name;
	const usernameChanged = previousUsername !== username;

	if (typeof rawUsername !== 'undefined' && usernameChanged) {
		if (!validateName(username)) {
			return false;
		}

		if (!(await _setUsername(_id, username, user))) {
			return false;
		}
		user.username = username;
	}

	if (typeof rawName !== 'undefined' && nameChanged) {
		if (!_setRealName(_id, name, user)) {
			return false;
		}
	}

	// if coming from old username, update all references
	if (previousUsername) {
		if (usernameChanged && typeof rawUsername !== 'undefined') {
			await MessagesRaw.updateAllUsernamesByUserId(user._id, username);
			await MessagesRaw.updateUsernameOfEditByUserId(user._id, username);
			Messages.findByMention(previousUsername).forEach(function (msg: IMessage) {
				const updatedMsg = msg.msg.replace(new RegExp(`@${previousUsername}`, 'ig'), `@${username}`);
				return Messages.updateUsernameAndMessageOfMentionByIdAndOldUsername(msg._id, previousUsername, username, updatedMsg);
			});
			await Rooms.replaceUsername(previousUsername, username);
			await Rooms.replaceMutedUsername(previousUsername, username);
			await Rooms.replaceUsernameOfUserByUserId(user._id, username);
			Subscriptions.setUserUsernameByUserId(user._id, username);

			await LivechatDepartmentAgents.replaceUsernameOfAgentByUserId(user._id, username);

			const fileStore = FileUpload.getStore('Avatars');
			const previousFile = await fileStore.model.findOneByName(previousUsername);
			const file = await fileStore.model.findOneByName(username);
			if (file) {
				fileStore.model.deleteFile(file._id);
			}
			if (previousFile) {
				fileStore.model.updateFileNameById(previousFile._id, username);
			}
		}

		// update other references if either the name or username has changed
		if (usernameChanged || nameChanged) {
			// update name and fname of 1-on-1 direct messages
			Subscriptions.updateDirectNameAndFnameByName(previousUsername, rawUsername && username, rawName && name);

			// update name and fname of group direct messages
			await updateGroupDMsName(user);

			// update name and username of users on video conferences
			await VideoConference.updateUserReferences(user._id, username || previousUsername, name || previousName);
		}
	}

	return true;
}
