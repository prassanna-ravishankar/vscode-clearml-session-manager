import { ClearMLApiClient } from './api-client';
import { Task } from './models/tasks';
import { ClearmlExtensionSettings, getExtensionSettings } from '../settings';

export const getPathToClearmlConfigFile = async (): Promise<string> => {
  const settings: ClearmlExtensionSettings = await getExtensionSettings();
  return settings.clearmlConfigFilePath;
};

export const getProjectName = async (): Promise<string> => {
  const settings: ClearmlExtensionSettings = await getExtensionSettings();
  return settings.clearmlProject;
};

export const fetchClearmlSessions = async (): Promise<Task[]> => {
  const clearmlConfigFpath: string = await getPathToClearmlConfigFile();
  const clearmlClient = await ClearMLApiClient.fromConfigFile(clearmlConfigFpath);
  await clearmlClient.auth();
  const interactiveSessions = await listClearmlSessions(clearmlClient);
  return interactiveSessions;
};

const listClearmlSessions = async (clearmlClient: ClearMLApiClient): Promise<Task[]> => {
  const clearmlProjectName: string = await getProjectName();
  const devopsProjectId = await clearmlClient.getProjectIdByName(clearmlProjectName);
  const interactiveSessions = await clearmlClient.getTasks({
    projectIds: [devopsProjectId],
    statuses: ['in_progress', 'queued'],
  });
  return interactiveSessions;
};
