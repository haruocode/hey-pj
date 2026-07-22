import type { ProjectRepository } from '../ports';
import type { Project } from '../../domain/project/Project';
import type { Member } from '../../domain/member/Member';

// プロジェクト作成（Durable Object を介さないグローバル操作）。
export async function createProject(repo: ProjectRepository, project: Project): Promise<void> {
  await repo.createProject(project);
}

// メンバー追加。
export async function addMember(repo: ProjectRepository, member: Member): Promise<void> {
  await repo.addMember(member);
}
