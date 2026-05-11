import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity("UserRepositoryLink")
@Unique(["userId", "githubRepoId"])
export class UserRepositoryLink {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "varchar" })
  githubRepoId: string;

  @CreateDateColumn()
  createdAt: Date;
}
