import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum AuthProvider {
  LOCAL = "local",
  GOOGLE = "google",
  GITHUB = "github",
  GUEST = "guest",
}

@Entity("User")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar" })
  username: string;

  @Column({ type: "varchar", unique: true })
  email: string;

  @Column({ type: "varchar", nullable: true })
  password: string | null;

  @Column({
    type: "enum",
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
  })
  authProvider: AuthProvider;

  @Column({ type: "varchar", nullable: true })
  googleId: string | null;

  @Column({ type: "varchar", nullable: true, unique: true })
  githubId: string | null;

  @Column({ type: "text", nullable: true })
  githubAccessToken: string | null;

  @Column({ type: "varchar", nullable: true })
  avatarUrl: string | null;

  @Column({ type: "boolean", default: false })
  isGuest: boolean;

  @Column({ type: "varchar", nullable: true })
  refreshToken: string | null;

  @Column({ type: "timestamp", nullable: true })
  lastLogin: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}