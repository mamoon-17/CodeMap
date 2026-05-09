import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum ProjectStatus {
  INDEXING = "indexing",
  READY = "ready",
  FAILED = "failed",
}

@Entity("Project")
export class Project {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({
    type: "enum",
    enum: ProjectStatus,
    default: ProjectStatus.INDEXING,
  })
  status: ProjectStatus;

  @Column({ type: "int", default: 0 })
  fileCount: number;

  @Column({ type: "varchar", nullable: true })
  zipStoragePath: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
