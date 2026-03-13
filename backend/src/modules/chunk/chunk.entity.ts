import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("Chunk")
export class Chunk {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar" })
  projectId: string;

  @Column({ type: "varchar" })
  filePath: string;

  @Column({ type: "integer" })
  startLine: number;

  @Column({ type: "integer" })
  endLine: number;

  @Column({ type: "text" })
  rawText: string;

  @Column({ type: "varchar", nullable: true })
  vectorId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}