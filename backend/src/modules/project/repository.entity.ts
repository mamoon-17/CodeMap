import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("Repository")
export class RepositoryRecord {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", unique: true })
  githubRepoId: string;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "varchar" })
  fullName: string;

  @Column({ type: "varchar" })
  url: string;

  @Column({ type: "varchar", nullable: true })
  language: string | null;

  @Column({ type: "int" })
  size: number;

  @Column({ type: "boolean", default: false })
  isPrivate: boolean;

  @Column({ type: "boolean", default: false })
  isFork: boolean;

  @Column({ type: "varchar" })
  ownerLogin: string;

  @Column({ type: "varchar", nullable: true })
  ownerAvatarUrl: string | null;

  @Column({ type: "timestamp", nullable: true })
  githubUpdatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
