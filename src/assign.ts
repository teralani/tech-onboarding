import { collections, Project, type Assignment } from "./db.js";
import { ObjectId } from "mongodb";

export type AssignResult =
  | { kind: "assigned"; assignment: Assignment }
  | { kind: "judge-busy" } // the judge already holds a QUEUED assignment
  | { kind: "none-available" }; // no project is eligible for this judge right now

/**
 * TODO: implement. See the README for the rules.
 *
 * `judgeId` is already validated to exist by the route. Use `collections()` from ./db.js.
 * Add any helpers you need.
 */
export async function assignNext(judgeId: string): Promise<AssignResult> {
  const { projects, assignments} = collections();

  const busy = await assignments.findOne({judgeId, status: "QUEUED"});
  if (busy) return {kind: "judge-busy"};

  const candidates = await projects
    .aggregate<{
      _id: string;
      completedCount: number;
    }> ([
      {
        $lookup: {
          from: "assignments",
          localField: "_id",
          foreignField: "projectId",
          as: "assignments"
        }
      },
      {
        $set: {
          assignedToJudge: {
            $anyElementTrue: {
              $map: {
                input: "$assignments",
                as: "assignment",
                in: {$eq: ["$$assignment.judgeId", judgeId]}
              }
            }
          },
          currentlyQueued: {
            $anyElementTrue: {
              $map: {
                input: "$assignments",
                as: "assignment",
                in: { $eq: ["$$assignment.status", "QUEUED"]}
              }
            }
          },
          completedCount: {
            $size: {
              $filter: {
                input: "$assignments",
                as: "assignment",
                cond: { $eq: ["$$assignment.status", "COMPLETED"]}
              }
            }
          }
        }
      },
      {
        $match: {
          assignedToJudge: false,
          currentlyQueued: false,
        }
      },
      {
        $sort: {completedCount: 1}
      }
    ]).toArray();

  if (candidates.length == 0) {
    return {kind: "none-available"};
  }

  let lastIndex = 0;

  if (candidates.length > 1) {
    for (let i = 0; i < candidates.length - 1; i++) {
      if (candidates[i].completedCount < candidates[i + 1].completedCount) {
        lastIndex = i;
        break;
      }
    } 
  }

  const randIndex = Math.floor(Math.random()*(lastIndex + 1));

  // Assignment {
  //   _id: ObjectId;
  //   judgeId: string;
  //   projectId: string;
  //   status: AssignmentStatus;
  //   createdAt: Date;
  // }

  const assignment : Assignment = {
    _id: new ObjectId(),
    judgeId: judgeId,
    projectId: candidates[randIndex]._id,
    status: "QUEUED",
    createdAt: new Date(),
  }

  await assignments.insertOne(assignment);
  return {kind: "assigned", assignment};
}
