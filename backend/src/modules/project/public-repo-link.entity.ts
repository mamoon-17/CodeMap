import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Per-user link to a public GitHub repository added by URL.
 *
 * The repo's metadata is stored in {@link RepositoryRecord} (shared across users,
 * keyed by `githubRepoId`). This entity tracks which user has linked which public
 * repo so the dashboard can show it after refresh/logout and reject duplicates.
 */
@Entity("PublicRepoLink")
@Index("UQ_PublicRepoLink_user_repo", ["userId", "githubRepoId"], { unique: true })
export class PublicRepoLink {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "varchar" })
  githubRepoId: string;

  @CreateDateColumn()
  createdAt: Date;
}
