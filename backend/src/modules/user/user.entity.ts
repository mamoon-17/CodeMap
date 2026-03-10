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

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  username: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string | null;

  @Column({
    type: "enum",
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
  })
  authProvider: AuthProvider;

  @Column({ nullable: true })
  googleId: string | null;

  @Column({ nullable: true })
  githubId: string | null;

  @Column({ default: false })
  isGuest: boolean;

  @Column({ nullable: true })
  refreshToken: string | null;

  @Column({ type: "timestamp", nullable: true })
  lastLogin: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}