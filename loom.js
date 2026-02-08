const fs = require("fs");
const path = require("path");

const AUTH_FILE = process.env.LOOM_AUTH_FILE || path.join(__dirname, "..", "auth.json");
const GRAPHQL_URL = "https://www.loom.com/graphql";

class LoomClient {
  constructor(authFile = AUTH_FILE) {
    const state = JSON.parse(fs.readFileSync(authFile, "utf8"));
    this.cookies = state.cookies
      .filter((c) => c.domain.includes("loom.com"))
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  async graphql(operationName, query, variables = {}) {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apollographql-client-name": "web",
        "x-loom-request-source": "loom_web",
        cookie: this.cookies,
      },
      body: JSON.stringify({ operationName, query, variables }),
    });
    if (!res.ok) throw new Error(`GraphQL ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
    return json.data;
  }

  async listVideos({ limit = 50, cursor = null, source = "MINE" } = {}) {
    const data = await this.graphql(
      "GetLoomsForLibrary",
      `query GetLoomsForLibrary($limit: Int!, $cursor: String, $source: LoomsSource!, $sortType: LoomsSortType!, $sortOrder: LoomsSortOrder!, $filters: [[LoomsCollectionFilter!]!]) {
        getLooms {
          ... on GetLoomsPayload {
            videos(first: $limit, after: $cursor, source: $source, sortType: $sortType, sortOrder: $sortOrder, filters: $filters) {
              edges {
                cursor
                node { id name visibility __typename }
              }
              pageInfo { endCursor hasNextPage }
            }
          }
        }
      }`,
      {
        source,
        sortType: "RECENT",
        sortOrder: "DESC",
        filters: [[{ type: "CREATED_BY_ME" }], [{ type: "NOT_IN_FOLDER" }]],
        limit,
        cursor,
      }
    );
    const videos = data.getLooms.videos;
    return {
      videos: videos.edges.map((e) => e.node),
      endCursor: videos.pageInfo.endCursor,
      hasNextPage: videos.pageInfo.hasNextPage,
    };
  }

  async searchVideos(query) {
    const data = await this.graphql(
      "Search",
      `query Search($searchQuery: String!) {
        search(searchQuery: $searchQuery) {
          ... on VideoFromSearch {
            id name createdAt folder
          }
        }
      }`,
      { searchQuery: query }
    );
    return data.search || [];
  }

  async searchVideosPaginated({ query, limit = 50, cursor = null } = {}) {
    const data = await this.graphql(
      "SearchVideos",
      `query SearchVideos($searchQuery: String!, $first: Int, $after: String) {
        searchVideos {
          ... on SearchVideosPayload {
            videoResults(searchQuery: $searchQuery, first: $first, after: $after) {
              edges { node { ... on VideoSearchResult { video { id name createdAt playable_duration } } } }
              pageInfo { endCursor hasNextPage }
            }
          }
        }
      }`,
      { searchQuery: query, first: limit, after: cursor }
    );
    const results = data.searchVideos.videoResults;
    return {
      videos: results.edges.map((e) => e.node.video),
      endCursor: results.pageInfo.endCursor,
      hasNextPage: results.pageInfo.hasNextPage,
    };
  }

  async getAllVideos() {
    const all = [];
    let cursor = null;
    while (true) {
      const { videos, endCursor, hasNextPage } = await this.listVideos({ limit: 50, cursor });
      all.push(...videos);
      if (!hasNextPage) break;
      cursor = endCursor;
    }
    return all;
  }

  async getVideo(videoId) {
    const data = await this.graphql(
      "fetchVideoData",
      `query fetchVideoData($id: ID!, $password: String) {
        video: getVideo(id: $id, password: $password) {
          ... on RegularUserVideo {
            id name createdAt playable_duration
            tags complete comments_enabled
            owner { id display_name avatars { thumb } }
            views { total distinct }
            totalComments totalReactions
            video_properties { width height screen_type }
            signedDefaultThumbnails { default static }
            organization { id name }
            calendarMeetingGuid storage
          }
          ... on VideoPasswordMissingOrIncorrect { id message }
          ... on PrivateVideo { id message }
        }
      }`,
      { id: videoId, password: null }
    );
    return data.video;
  }

  async getTranscriptDetails(videoId) {
    const data = await this.graphql(
      "fetchVideoTranscript",
      `query fetchVideoTranscript($videoId: ID!) {
        fetchVideoTranscript(videoId: $videoId) {
          ... on VideoTranscriptDetails {
            idv2 video_id version
            transcript_url captions_url source_url captions_source_url
            transcription_status processing_service language
          }
        }
      }`,
      { videoId }
    );
    return data.fetchVideoTranscript;
  }

  async getTranscript(videoId) {
    const details = await this.getTranscriptDetails(videoId);
    if (!details?.source_url) return null;
    const res = await fetch(details.source_url);
    if (!res.ok) throw new Error(`Transcript fetch ${res.status}`);
    const json = await res.json();
    return json.phrases.map((p) => ({
      timestamp: p.ts,
      speaker: p.speakerName || null,
      text: p.value,
    }));
  }

  async getTranscriptText(videoId) {
    const phrases = await this.getTranscript(videoId);
    if (!phrases) return null;
    return phrases.map((p) => {
      const ts = formatTimestamp(p.timestamp);
      const speaker = p.speaker ? `[${p.speaker}] ` : "";
      return `${ts} ${speaker}${p.text.trim()}`;
    }).join("\n");
  }

  async getCaptions(videoId) {
    const details = await this.getTranscriptDetails(videoId);
    if (!details?.captions_source_url) return null;
    const res = await fetch(details.captions_source_url);
    if (!res.ok) return null;
    return await res.text();
  }

  async getDownloadUrl(videoId) {
    const data = await this.graphql(
      "GetVideoTranscodedUrl",
      `query GetVideoTranscodedUrl($videoId: ID!, $forceOriginal: Boolean) {
        getVideoTranscodedUrl(videoId: $videoId, forceOriginal: $forceOriginal) {
          ... on VideoSource { url }
        }
      }`,
      { videoId, forceOriginal: false }
    );
    return data.getVideoTranscodedUrl?.url || null;
  }

  async getChapters(videoId) {
    const data = await this.graphql(
      "FetchChapters",
      `query FetchChapters($videoId: ID!, $password: String) {
        fetchVideoChapters(videoId: $videoId, password: $password) {
          ... on VideoChapters { id video_id content schema_version updatedAt edited_at auto_chapter_status }
          ... on EmptyChaptersPayload { content }
        }
      }`,
      { videoId, password: null }
    );
    return data.fetchVideoChapters;
  }

  async getSummary(videoId) {
    const data = await this.graphql(
      "GetAutoSummaryStatus",
      `query GetAutoSummaryStatus($videoId: ID!, $password: String) {
        getAutoFeatureStatuses(videoId: $videoId, password: $password) {
          ... on AutoFeatureStatuses { id autoDescription autoDescriptionStatus }
          ... on Error { message }
        }
      }`,
      { videoId, password: null }
    );
    return data.getAutoFeatureStatuses;
  }

  async getComments(videoId) {
    const data = await this.graphql(
      "fetchVideoComments",
      `query fetchVideoComments($id: ID!, $password: String) {
        video: getVideo(id: $id, password: $password) {
          ... on RegularUserVideo {
            id
            video_comments(includeDeleted: false) {
              id content(withMentionMarkups: false) time_stamp(password: $password)
              user_name createdAt
              children_comments {
                id content(withMentionMarkups: false) time_stamp(password: $password)
                user_name createdAt
              }
            }
          }
        }
      }`,
      { id: videoId, password: null }
    );
    return data.video?.video_comments || [];
  }

  async getTasks(videoId) {
    const data = await this.graphql(
      "GetVideoTasks",
      `query GetVideoTasks($videoId: ID!, $password: String) {
        getVideoTasks(videoId: $videoId, password: $password) {
          ... on GetVideoTasksPayload {
            tasks {
              id video_id content(withMentionMarkups: false)
              time_stamp activity_type source
              createdAt approved_at resolved_at
              owner { id display_name }
              responses {
                id responded_at
                user { id display_name }
              }
            }
          }
          ... on Error { message }
        }
      }`,
      { videoId, password: null }
    );
    return data.getVideoTasks?.tasks || [];
  }

  async getReactions(videoId) {
    const data = await this.graphql(
      "fetchVideoReactions",
      `query fetchVideoReactions($id: ID!, $password: String) {
        videoReactionsForVideo(videoId: $id, password: $password) {
          ... on VideoReactionsSuccessPayload {
            reactions {
              id time reaction extended_reaction category
              user { id display_name }
              anon_user_id anon_user_name
            }
          }
        }
      }`,
      { id: videoId, password: null }
    );
    return data.videoReactionsForVideo?.reactions || [];
  }

  async getMeetingNotesUrl(videoId) {
    const data = await this.graphql(
      "GetMeetingNotesPage",
      `query GetMeetingNotesPage($videoId: ID!, $password: String) {
        getVideo(id: $videoId, password: $password) {
          ... on RegularUserVideo {
            id calendarMeetingGuid
            meetingNotesPage { pageUrl }
          }
        }
      }`,
      { videoId, password: null }
    );
    return data.getVideo?.meetingNotesPage?.pageUrl || null;
  }

  async listFolders({ limit = 50, cursor = null } = {}) {
    const data = await this.graphql(
      "GetPublishedFolders",
      `query GetPublishedFolders($first: Int!, $after: String, $source: FolderSource!, $sortType: LoomsSortType!, $sortOrder: LoomsSortOrder!, $filters: [LoomsCollectionFilter!]) {
        getPublishedFolders {
          ... on GetPublishedFoldersPayload {
            folders(first: $first, after: $after, source: $source, sortType: $sortType, sortOrder: $sortOrder, filters: $filters) {
              edges { cursor node { id name visibility } }
              pageInfo { endCursor hasNextPage }
            }
          }
        }
      }`,
      {
        first: limit,
        after: cursor,
        source: "ACTIVE",
        sortType: "RECENT",
        sortOrder: "DESC",
        filters: [{ type: "CREATED_BY_ME" }],
      }
    );
    const folders = data.getPublishedFolders.folders;
    return {
      folders: folders.edges.map((e) => e.node),
      endCursor: folders.pageInfo.endCursor,
      hasNextPage: folders.pageInfo.hasNextPage,
    };
  }

  async listSpaces({ limit = 50, cursor = null } = {}) {
    const data = await this.graphql(
      "GetMySpaceMemberships",
      `query GetMySpaceMemberships($first: Int!, $after: String) {
        result: getMySpaceMemberships {
          ... on GetMySpaceMembershipsPayload {
            memberships(first: $first, after: $after) {
              edges {
                node {
                  id unread
                  space { id name privacy is_primary }
                }
              }
              pageInfo { endCursor hasNextPage }
            }
          }
          ... on Error { message }
        }
      }`,
      { first: limit, after: cursor }
    );
    const memberships = data.result.memberships;
    return {
      spaces: memberships.edges.map((e) => e.node.space),
      endCursor: memberships.pageInfo.endCursor,
      hasNextPage: memberships.pageInfo.hasNextPage,
    };
  }

  async getBacklinks(videoId) {
    const data = await this.graphql(
      "GetVideoBacklinks",
      `query GetVideoBacklinks($videoId: ID!, $password: String) {
        getVideoBacklinks(videoId: $videoId, password: $password) {
          ... on GetVideoBacklinksPayload {
            backlinks { id source sourceLink title isSynced }
          }
        }
      }`,
      { videoId, password: null }
    );
    return data.getVideoBacklinks?.backlinks || [];
  }
  async getKeyTakeaways(videoId) {
    const data = await this.graphql(
      "GetKeyTakeaways",
      `query GetKeyTakeaways($videoId: ID!) {
        getKeyTakeaways(videoId: $videoId) {
          ... on GetKeyTakeawaysPayload { takeaways }
        }
      }`,
      { videoId }
    );
    return data.getKeyTakeaways?.takeaways || [];
  }

  async getTags(videoId) {
    const data = await this.graphql(
      "GetTagsByVideoId",
      `query GetTagsByVideoId($videoId: ID!) {
        getTagsByVideoId(videoId: $videoId) {
          ... on GetTagsByVideoIdPayload { tags }
        }
      }`,
      { videoId }
    );
    return data.getTagsByVideoId?.tags || [];
  }

  async getConfluencePages(videoId) {
    const data = await this.graphql(
      "GetVideoConfluencePages",
      `query GetVideoConfluencePages($videoId: ID!) {
        getVideoConfluencePages(videoId: $videoId) {
          ... on GetVideoConfluencePagesPayload {
            pages { url title }
          }
        }
      }`,
      { videoId }
    );
    return data.getVideoConfluencePages?.pages || [];
  }

  async getDescription(videoId) {
    const data = await this.graphql(
      "GetVideoDescription",
      `query GetVideoDescription($videoId: ID!) {
        getVideo(id: $videoId) {
          ... on RegularUserVideo { id description }
        }
      }`,
      { videoId }
    );
    return data.getVideo?.description || null;
  }

  async fetchVideosById(videoIds) {
    const data = await this.graphql(
      "FetchVideosById",
      `query FetchVideosById($videoIds: [ID!]!) {
        fetchVideosById(videoIds: $videoIds) {
          ... on FetchVideosByIdPayload {
            videos { id name createdAt playable_duration }
          }
        }
      }`,
      { videoIds }
    );
    return data.fetchVideosById?.videos || [];
  }

  async getSpace(spaceId) {
    const data = await this.graphql(
      "GetSpace",
      `query GetSpace($spaceId: ID!) {
        getSpace(spaceId: $spaceId) {
          ... on GetSpacePayload {
            space { id name privacy is_primary }
          }
        }
      }`,
      { spaceId }
    );
    return data.getSpace?.space || null;
  }

  async searchFolders(query) {
    const data = await this.graphql(
      "SearchFolders",
      `query SearchFolders($searchQuery: String!) {
        searchFolders(searchQuery: $searchQuery) {
          ... on SearchFoldersPayload {
            folders { id name }
          }
        }
      }`,
      { searchQuery: query }
    );
    return data.searchFolders?.folders || [];
  }

  async getLastWatchTime(videoId) {
    const data = await this.graphql(
      "GetLastWatchTime",
      `query GetLastWatchTime($videoId: ID!) {
        getLastWatchTime(videoId: $videoId) {
          ... on GetLastWatchTimePayload { lastWatchTime }
        }
      }`,
      { videoId }
    );
    return data.getLastWatchTime?.lastWatchTime ?? null;
  }

  async getWatchLaterCount() {
    const data = await this.graphql(
      "GetUserWatchLaterListCount",
      `query GetUserWatchLaterListCount {
        getUserWatchLaterListCount {
          ... on WatchLaterListVideoCount { count }
        }
      }`
    );
    return data.getUserWatchLaterListCount?.count ?? 0;
  }

  async getTotalVideosCount(userId) {
    const data = await this.graphql(
      "GetTotalVideosCountByUser",
      `query GetTotalVideosCountByUser($userId: ID!) {
        getTotalVideosCountByUser(userId: $userId) {
          ... on TotalVideosCountByUserPayload { videos_count }
        }
      }`,
      { userId }
    );
    return data.getTotalVideosCountByUser?.videos_count ?? 0;
  }

  async getFrequentReactions() {
    const data = await this.graphql(
      "GetRecentlyFrequentUserReactions",
      `query GetRecentlyFrequentUserReactions {
        getRecentlyFrequentUserReactions {
          ... on getRecentlyFrequentUserReactionsPayload { reactions }
        }
      }`
    );
    return data.getRecentlyFrequentUserReactions?.reactions || [];
  }

  async getCommentReactions(commentId, commentType = "COMMENT") {
    const data = await this.graphql(
      "GetCommentReactions",
      `query GetCommentReactions($commentGuid: ID!, $commentType: CommentType!) {
        getCommentReactions(commentGuid: $commentGuid, commentType: $commentType) {
          ... on GetCommentReactionsPayload {
            commentReactions { id userName extendedReaction createdAt }
          }
          ... on GenericError { message }
        }
      }`,
      { commentGuid: commentId, commentType }
    );
    return data.getCommentReactions?.commentReactions || [];
  }

  async getFolder(folderId) {
    const data = await this.graphql(
      "GetFolder",
      `query GetFolder($folderId: ID!) {
        folder(id: $folderId) {
          __typename
          ... on SharedFolder {
            id name visibility createdAt updatedAt
            created_by { id display_name }
          }
        }
      }`,
      { folderId }
    );
    return data.folder || null;
  }

  // --- Mutations ---

  async updateVideoName(videoId, name) {
    const data = await this.graphql(
      "UpdateVideoName",
      `mutation UpdateVideoName($id: ID!, $name: String!) {
        updateVideoName(id: $id, name: $name) {
          ... on RegularUserVideo { id name }
        }
      }`,
      { id: videoId, name }
    );
    return data.updateVideoName;
  }

  async updateVideoDescription(videoId, description) {
    const data = await this.graphql(
      "UpdateVideoDescription",
      `mutation UpdateVideoDescription($id: ID!, $description: String!) {
        updateVideoDescription(id: $id, description: $description) {
          ... on RegularUserVideo { id description }
        }
      }`,
      { id: videoId, description }
    );
    return data.updateVideoDescription;
  }

  async createComment(videoId, content, timestamp = 0) {
    const data = await this.graphql(
      "CreateVideoComment",
      `mutation CreateVideoComment($videoId: ID!, $content: String!, $timestamp: Int!) {
        createVideoComment(videoId: $videoId, content: $content, timestamp: $timestamp) {
          ... on PublicVideoComment { id content time_stamp user_name createdAt }
        }
      }`,
      { videoId, content, timestamp }
    );
    return data.createVideoComment;
  }

  async archiveVideos(videoIds, archive = true) {
    const data = await this.graphql(
      "ArchiveVideos",
      `mutation ArchiveVideos($videoIds: [ID!]!, $isArchived: Boolean!) {
        archiveVideos(videoIds: $videoIds, isArchived: $isArchived) {
          __typename
        }
      }`,
      { videoIds, isArchived: archive }
    );
    return data.archiveVideos;
  }

  async duplicateVideo(videoId) {
    const data = await this.graphql(
      "DuplicateVideo",
      `mutation DuplicateVideo($videoId: ID!) {
        duplicateVideo(videoId: $videoId) {
          __typename
        }
      }`,
      { videoId }
    );
    return data.duplicateVideo;
  }

  async editComment(commentId, videoId, content, type = "COMMENT") {
    const data = await this.graphql(
      "EditComment",
      `mutation EditComment($id: ID!, $videoId: ID!, $content: String!, $type: PublicVideoCommentType!) {
        editComment(id: $id, videoId: $videoId, content: $content, type: $type) {
          __typename
        }
      }`,
      { id: commentId, videoId, content, type }
    );
    return data.editComment;
  }

  async deleteComment(commentId, type = "COMMENT") {
    const data = await this.graphql(
      "DeleteComment",
      `mutation DeleteComment($id: ID!, $type: PublicVideoCommentType!) {
        deleteComment(id: $id, type: $type)
      }`,
      { id: commentId, type }
    );
    return data.deleteComment;
  }

  async createTask(videoId, content, timestamp = 0) {
    const data = await this.graphql(
      "CreateVideoTask",
      `mutation CreateVideoTask($videoId: ID!, $content: String!, $timestamp: Int!) {
        createVideoTask(videoId: $videoId, content: $content, timestamp: $timestamp) {
          ... on CreateVideoTaskPayload {
            task { id content time_stamp }
          }
        }
      }`,
      { videoId, content, timestamp }
    );
    return data.createVideoTask?.task || data.createVideoTask;
  }

  async deleteTask(taskId) {
    const data = await this.graphql(
      "DeleteVideoTask",
      `mutation DeleteVideoTask($id: ID!) {
        deleteVideoTask(id: $id) {
          __typename
        }
      }`,
      { id: taskId }
    );
    return data.deleteVideoTask;
  }

  async approveTask(taskId) {
    const data = await this.graphql(
      "ApproveVideoTask",
      `mutation ApproveVideoTask($id: ID!) {
        approveVideoTask(id: $id) {
          __typename
        }
      }`,
      { id: taskId }
    );
    return data.approveVideoTask;
  }

  async respondToTask(taskId, responded = true) {
    const data = await this.graphql(
      "RespondToVideoTask",
      `mutation RespondToVideoTask($id: ID!, $responded: Boolean!) {
        respondToVideoTask(id: $id, responded: $responded) {
          __typename
        }
      }`,
      { id: taskId, responded }
    );
    return data.respondToVideoTask;
  }

  async addReaction(videoId, time, type) {
    const data = await this.graphql(
      "AddVideoReaction",
      `mutation AddVideoReaction($videoId: ID!, $time: Int!, $type: String!) {
        addVideoReaction(videoId: $videoId, time: $time, type: $type) {
          ... on PublicVideoReaction { id time reaction extended_reaction category }
          ... on InvalidRequestWarning { message }
        }
      }`,
      { videoId, time, type }
    );
    return data.addVideoReaction;
  }

  async deleteReaction(reactionId) {
    const data = await this.graphql(
      "DeleteVideoReaction",
      `mutation DeleteVideoReaction($reactionId: ID!) {
        deleteVideoReaction(reactionId: $reactionId)
      }`,
      { reactionId }
    );
    return data.deleteVideoReaction;
  }

  async toggleFollowing(videoId, follow) {
    const data = await this.graphql(
      "ToggleFollowingVideo",
      `mutation ToggleFollowingVideo($videoId: String!, $follow: Boolean!) {
        toggleFollowingVideo(videoId: $videoId, follow: $follow) {
          ... on UserFollowsStream { id follow }
        }
      }`,
      { videoId, follow }
    );
    return data.toggleFollowingVideo;
  }

  async deleteVideo(videoId) {
    const data = await this.graphql(
      "DeleteVideo",
      `mutation DeleteVideo($id: ID!) {
        deleteVideo(id: $id)
      }`,
      { id: videoId }
    );
    return data.deleteVideo;
  }

  async addToWatchLater(videoId, minutesFromUTC = 0) {
    const data = await this.graphql(
      "AddVideoToWatchLaterList",
      `mutation AddVideoToWatchLaterList($videoId: ID!, $minutesFromUTC: Int!) {
        addVideoToWatchLaterList(videoId: $videoId, minutesFromUTC: $minutesFromUTC) {
          __typename
        }
      }`,
      { videoId, minutesFromUTC }
    );
    return data.addVideoToWatchLaterList;
  }

  async removeFromWatchLater(videoId) {
    const data = await this.graphql(
      "RemoveVideoFromWatchLaterList",
      `mutation RemoveVideoFromWatchLaterList($videoId: ID!) {
        removeVideoFromWatchLaterList(videoId: $videoId) {
          __typename
        }
      }`,
      { videoId }
    );
    return data.removeVideoFromWatchLaterList;
  }

  async createFolder(name) {
    const data = await this.graphql(
      "CreateFolder",
      `mutation CreateFolder($name: String!) {
        createFolder(name: $name) {
          ... on CreateFolderPayload { __typename }
        }
      }`,
      { name }
    );
    return data.createFolder;
  }

  async renameFolder(folderId, name) {
    const data = await this.graphql(
      "RenameFolder",
      `mutation RenameFolder($folderId: ID!, $name: String!) {
        renameFolder(folderId: $folderId, name: $name) {
          __typename
        }
      }`,
      { folderId, name }
    );
    return data.renameFolder;
  }

  async deleteFolders(folderIds) {
    const data = await this.graphql(
      "BulkDeleteFolders",
      `mutation BulkDeleteFolders($folderIds: [ID!]!) {
        bulkDeleteFolders(folderIds: $folderIds) {
          __typename
        }
      }`,
      { folderIds }
    );
    return data.bulkDeleteFolders;
  }

  async getUserById(userId) {
    const data = await this.graphql(
      "GetUserById",
      `query GetUserById($userId: ID!) {
        getUserById(userId: $userId) {
          ... on RegularUserPayload {
            user {
              id display_name first_name last_name email
              company_name companyPosition
              avatars { thumb large }
            }
          }
          ... on GenericError { message }
        }
      }`,
      { userId }
    );
    return data.getUserById?.user || null;
  }

  async searchWorkspaceTags(query) {
    const data = await this.graphql(
      "SearchWorkspaceTags",
      `query SearchWorkspaceTags($query: String!) {
        searchWorkspaceTags(query: $query) {
          ... on MatchedTags { tags { __typename } }
          ... on GenericError { message }
        }
      }`,
      { query }
    );
    return data.searchWorkspaceTags?.tags || [];
  }

  async bulkMoveVideos(videoIds, newParentFolderId) {
    const data = await this.graphql(
      "BulkMoveVideos",
      `mutation BulkMoveVideos($videoIds: [ID!]!, $newParentFolderId: ID!) {
        bulkMoveVideos(videoIds: $videoIds, newParentFolderId: $newParentFolderId) {
          __typename
        }
      }`,
      { videoIds, newParentFolderId }
    );
    return data.bulkMoveVideos;
  }

  async bulkMoveFolders(folderIds, newParentFolderId) {
    const data = await this.graphql(
      "BulkMoveFolders",
      `mutation BulkMoveFolders($folderIds: [ID!]!, $newParentFolderId: ID!) {
        bulkMoveFolders(folderIds: $folderIds, newParentFolderId: $newParentFolderId) {
          __typename
        }
      }`,
      { folderIds, newParentFolderId }
    );
    return data.bulkMoveFolders;
  }

  async recoverVideo(videoId) {
    const data = await this.graphql(
      "RecoverVideo",
      `mutation RecoverVideo($videoId: ID!, $force: Boolean!) {
        recoverVideo(videoId: $videoId, force: $force) {
          __typename
        }
      }`,
      { videoId, force: false }
    );
    return data.recoverVideo;
  }

  async updateVideoPinStatus(videoId, pinned) {
    const data = await this.graphql(
      "UpdateVideoPinStatus",
      `mutation UpdateVideoPinStatus($input: UpdateVideoPinStatusInput!) {
        updateVideoPinStatus(input: $input) {
          __typename
        }
      }`,
      { input: { videoId, newStatus: pinned, context: "library" } }
    );
    return data.updateVideoPinStatus;
  }

  async addCommentReaction(commentGuid, extendedReaction, commentType = "COMMENT") {
    const data = await this.graphql(
      "AddCommentReaction",
      `mutation AddCommentReaction($input: AddCommentReactionInput!) {
        addCommentReaction(input: $input) {
          __typename
        }
      }`,
      { input: { commentGuid, commentType, extendedReaction } }
    );
    return data.addCommentReaction;
  }

  async toggleFollowingTag(tag, follow) {
    const data = await this.graphql(
      "ToggleFollowingTag",
      `mutation ToggleFollowingTag($tag: String!, $follow: Boolean!) {
        toggleFollowingTag(tag: $tag, follow: $follow) {
          ... on UserFollowsStream { id follow }
        }
      }`,
      { tag, follow }
    );
    return data.toggleFollowingTag;
  }

  async batchShareVideosToSpaces(videoIds, spaceIds) {
    const data = await this.graphql(
      "BatchShareVideosToSpaces",
      `mutation BatchShareVideosToSpaces($videoIds: [ID!]!, $spaceIds: [ID!]!) {
        batchShareVideosToSpaces(videoIds: $videoIds, spaceIds: $spaceIds) {
          ... on BatchShareVideosToSpacesPayload { __typename }
          ... on GenericError { message }
        }
      }`,
      { videoIds, spaceIds }
    );
    return data.batchShareVideosToSpaces;
  }

  async updateVideoSettings(videoId, settings) {
    const data = await this.graphql(
      "UpdateVideoSettings",
      `mutation UpdateVideoSettings($videoId: ID!, $settings: VideoSettingsInput!) {
        updateVideoSettings(videoId: $videoId, settings: $settings) {
          ... on UpdateVideoSettingsResponse { __typename }
          ... on GenericError { message }
          ... on InvalidRequestWarning { message }
        }
      }`,
      { videoId, settings }
    );
    return data.updateVideoSettings;
  }

  async updateVideoTask(taskId, content) {
    const data = await this.graphql(
      "UpdateVideoTask",
      `mutation UpdateVideoTask($id: ID!, $content: String!) {
        updateVideoTask(id: $id, content: $content) {
          ... on GenericError { message }
          __typename
        }
      }`,
      { id: taskId, content }
    );
    return data.updateVideoTask;
  }
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

module.exports = { LoomClient };
