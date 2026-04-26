import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum ReindexJobStatus {
  STARTED = "started",
  COMPLETED = "completed",
  FAILED = "failed",
}

export type ReindexLogLevel = "info" | "warn" | "error";

export interface ReindexLogEntry {
  ts: string;
  level: ReindexLogLevel;
  message: string;
}

@Entity("ReindexJob")
export class ReindexJob {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar" })
  userId: string;

  // GitHub repo id (numeric as string)
  @Column({ type: "varchar" })
  githubRepoId: string;

  @Column({ type: "varchar" })
  projectId: string;

  @Index()
  @Column({
    type: "enum",
    enum: ReindexJobStatus,
    default: ReindexJobStatus.STARTED,
  })
  status: ReindexJobStatus;

  @Column({ type: "varchar", default: "queued" })
  lastStep: string;

  @Column({ type: "text", nullable: true })
  error: string | null;

  @Column({ type: "text", nullable: true })
  stackTrace: string | null;

  @Column({ type: "int", default: 0 })
  indexedChunks: number;

  @Column({ type: "int", default: 0 })
  skippedFilesCount: number;

  @Column({ type: "jsonb", nullable: true })
  skippedFiles: Array<{ file: string; reason: string }> | null;

  @Column({ type: "jsonb", nullable: true })
  logs: ReindexLogEntry[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

