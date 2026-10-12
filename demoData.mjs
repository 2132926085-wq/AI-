/**
 * label-template-demo/demoData.mjs
 * 作品演示数据：把脱敏标准 JSON / 通用类别样本转换为前端 ParseResult 结构。
 * 仅用于作品展示，全部为脱敏示例数据。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(__dirname, './data');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, name), 'utf8'));
}

function b64decode(b64) {
  if (!b64) return null;
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function formConfigFromB64(b64) {
  const raw = b64decode(b64);
  if (!raw || !Array.isArray(raw.fields)) return null;
  return {
    fields: raw.fields,
    graph: Array.isArray(raw.graph) ? raw.graph : [],
    conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
    effects: Array.isArray(raw.effects) ? raw.effects : [],
    rules: Array.isArray(raw.rules) ? raw.rules : [],
  };
}

function fieldsFromB64(b64) {
  const raw = b64decode(b64);
  return raw && Array.isArray(raw.fields) ? raw.fields : undefined;
}

function mapPointCloudTool(tool) {
  const out = { type: tool.type };
  if (Array.isArray(tool.project_children)) {
    out.project_children = tool.project_children.map((pc) => {
      const o = {
        name: pc.name || '2D',
        display_color: pc.display_color,
        all_cameras: pc.all_cameras,
        tools: (pc.tools || []).map((t) => ({ project_method: t.project_method, type: t.type })),
      };
      for (const k of ['display_name', 'key', 'count', 'max_count']) {
        if (pc[k] !== undefined) o[k] = pc[k];
      }
      const dyn = fieldsFromB64(pc.label_config_dynamic);
      if (dyn) o.label_config_dynamic_fields = dyn;
      return o;
    });
  } else if (tool.type === 'POINTS') {
    out.project_children = [];
  }
  for (const k of [
    'default_create_method', 'auto_snap', 'show_direction', 'similar_rectangle',
    'default_size', 'max_size', 'min_size', 'valid_threshold_frames',
    'cross_frame_threshold', 'cube_color',
  ]) {
    if (tool[k] !== undefined) out[k] = tool[k];
  }
  return out;
}

function mapPointCloudOntologyItem(item) {
  const out = {
    key: item.key,
    class_name: item.class_name,
    display_color: item.display_color,
  };
  if (item.display_name !== undefined) out.display_name = item.display_name;
  const lc = fieldsFromB64(item.label_config);
  if (lc) out.label_config_fields = lc;
  const lcd = fieldsFromB64(item.label_config_dynamic);
  if (lcd) out.label_config_dynamic_fields = lcd;
  out.children = (item.children || []).map((child) => {
    const c = { name: child.name || '3D', display_color: child.display_color };
    for (const k of ['display_name', 'key', 'count', 'max_count']) {
      if (child[k] !== undefined) c[k] = child[k];
    }
    const clc = fieldsFromB64(child.label_config);
    if (clc) c.label_config_fields = clc;
    const clcd = fieldsFromB64(child.label_config_dynamic);
    if (clcd) c.label_config_dynamic_fields = clcd;
    c.tools = (child.tools || []).map(mapPointCloudTool);
    return c;
  });
  return out;
}

function buildPointCloudParseResult(templateType, stdJson) {
  const attributes = stdJson.attributes || {};
  const extracted = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (k === 'frame_config' || k === 'image_config') continue;
    extracted[k] = v;
  }
  return {
    type: 'LIDAR_ANNOTATION_V2',
    subType: templateType,
    ontology: (stdJson.ontology || []).map(mapPointCloudOntologyItem),
    questionType: stdJson.questionType || [],
    extractedConfig: extracted,
    frameConfig: formConfigFromB64(attributes.frame_config),
    imageConfig: formConfigFromB64(attributes.image_config),
  };
}

/* ============ 图像 GENERAL：9 类通用目标 ============ */
const IMAGE_CATEGORIES = [
  ['小汽车', 'car', '#2563eb'],
  ['卡车', 'truck', '#f44e3b'],
  ['公交车', 'bus', '#fa28ff'],
  ['行人', 'pedestrian', '#73d8ff'],
  ['自行车', 'bicycle', '#aaf7a3'],
  ['摩托车', 'motorcycle', '#dbdf00'],
  ['交通灯', 'traffic_light', '#4611a0'],
  ['路标', 'road_sign', '#9f0500'],
  ['障碍物', 'obstacle', '#73d86c'],
].map(([categoryName, categoryEnName, displayColor]) => ({
  categoryName,
  categoryEnName,
  displayColor,
  multiple: false,
  config: { fields: [], graph: [], conditions: [], effects: [], rules: [] },
  components: [
    {
      name: '新组件',
      count: 1,
      tool: { type: 'rectangle', models: ['object-detection-multi'] },
    },
  ],
}));

/* ============ LANDMARK：人脸 42 关键点（参考 face-landmark.docx 示例） ============ */
const LANDMARK_GROUPS = [
  {
    categoryName: '人脸关键点',
    categoryEnName: 'face_landmark',
    displayColor: '#5cdef0',
    multiple: false,
    config: { fields: [], graph: [], conditions: [], effects: [], rules: [] },
    components: [
      {
        name: '关键点',
        count: 1,
        tool: {
          type: 'keypoints',
          config: {
            groups: [
              { name: '轮廓', range: [1, 17], color: '#5cdef0' },
              { name: '左眉', range: [18, 21], color: '#fe9200' },
              { name: '右眉', range: [22, 25], color: '#fe9200' },
              { name: '左眼', range: [26, 30], color: '#73d8ff' },
              { name: '右眼', range: [31, 35], color: '#73d8ff' },
              { name: '鼻梁', range: [36, 38], color: '#f44e3b' },
              { name: '嘴部', range: [39, 42], color: '#fa28ff' },
            ],
            lines: [
              { points: [1, 17], color: '#5cdef0' },
              { points: [18, 21], color: '#fe9200' },
              { points: [22, 25], color: '#fe9200' },
              { points: [26, 30], color: '#73d8ff' },
              { points: [31, 35], color: '#73d8ff' },
              { points: [36, 38], color: '#f44e3b' },
              { points: [39, 42], color: '#fa28ff' },
            ],
          },
        },
      },
    ],
  },
];

/* ============ 音频：MULTI_CHANNEL_TRANSCRIPTION ============ */
const AUDIO_RESULT = {
  type: 'MULTI_CHANNEL_TRANSCRIPTION',
  globalConfig: null,
  segmentConfig: null,
  channelConfig: null,
  styleConfig: null,
  tagGroups: null,
  ontology: [
    { key: 1, class_name: 'person1', display_color: '#DBDF00', description: '', translation_required: true },
    { key: 2, class_name: 'person2', display_color: '#f2a538', description: '', translation_required: true },
  ],
  validity: null,
  audioMode: 'multi',
  segmentMode: 'individual',
  segmentOverlap: 'overlap',
  translationRequiredMode: 'all',
  speakers: [
    { key: 1, name: 'person1', description: '说话人 1' },
    { key: 2, name: 'person2', description: '说话人 2' },
  ],
  minLength: '',
  maxLength: '',
  deviation: '',
  questionType: ['Wrong speaker', 'Wrong category', 'Wrong attribute'],
  extractedConfig: {},
};

/* ============ 点云：从标准 JSON 示例解码 ============ */
const PC_SEMANTIC = loadJson('semantic-segmentation.json');
const PC_STATIC = loadJson('static-obstacle.json');
const PC_DYNAMIC = loadJson('dynamic-obstacle.json');

export const DEMO_POINTCLOUD = {
  POINT_CLOUD_SEMANTIC_SEGMENTATION: buildPointCloudParseResult('POINT_CLOUD_SEMANTIC_SEGMENTATION', PC_SEMANTIC),
  POINT_CLOUD_STATIC_OBSTACLE: buildPointCloudParseResult('POINT_CLOUD_STATIC_OBSTACLE', PC_STATIC),
  POINT_CLOUD_DYNAMIC_OBSTACLE: buildPointCloudParseResult('POINT_CLOUD_DYNAMIC_OBSTACLE', PC_DYNAMIC),
};

/* ============ 每个模板的演示描述 / 原文 / 页数 ============ */
export const DEMO_IMAGE_CATEGORIES = IMAGE_CATEGORIES;
export const DEMO_LANDMARK_GROUPS = LANDMARK_GROUPS;
export const DEMO_AUDIO_RESULT = AUDIO_RESULT;

export const DEMO_PROFILES = {
  GENERAL_IMAGE_ANNOTATION: {
    description:
      '文档定义了 9 类通用目标标注类别：小汽车、卡车、公交车、行人、自行车、摩托车、交通灯、路标、障碍物。所有类别使用矩形框（rectangle）标注，默认单实例，不配置类别级属性；采用按类别编号、按实例编号的编号方式，支持 OCR 自动识别，标注形状显示面积，提交前校验属性完整性。',
    rawText:
      '【标注类别】\n- 小汽车（car）\n- 卡车（truck）\n- 公交车（bus）\n- 行人（pedestrian）\n- 自行车（bicycle）\n- 摩托车（motorcycle）\n- 交通灯（traffic_light）\n- 路标（road_sign）\n- 障碍物（obstacle）\n\n【标注要求】\n- 使用矩形框标注目标物\n- 按类别编号、按实例编号\n- 提交前校验属性完整性',
    pageCount: 18,
  },
  LANDMARK_ANNOTATION: {
    description:
      '文档定义人脸 42 关键点标注规范：按区域标注关键点并连线，共 42 个关键点，分为轮廓（1-17）、左眉（18-21）、右眉（22-25）、左眼（26-30）、右眼（31-35）、鼻梁（36-38）、嘴部（39-42）；每个区域使用 keypoint 工具标注，不同区域用不同颜色区分，输出标签配置与属性配置两个文件。',
    rawText:
      '【关键点区域】\n- 轮廓：1-17\n- 左眉：18-21\n- 右眉：22-25\n- 左眼：26-30\n- 右眼：31-35\n- 鼻梁：36-38\n- 嘴部：39-42\n\n【标注要求】\n- 使用 keypoint 工具分区域标注\n- 区域间按骨架连线\n- 输出标签配置 + 属性配置',
    pageCount: 0,
  },
  MULTI_CHANNEL_TRANSCRIPTION: {
    description:
      '文档定义多通道音频转写标注规范：2 位说话人（person1、person2），多通道（multi）模式，音频段独立（individual）、允许重叠（overlap），全部需要翻译；可配置全局属性、音频段属性、通道属性、样式配置、标签组与有效性配置；质检分类包括 Wrong speaker、Wrong category、Wrong attribute。',
    rawText:
      '【音频模式】\n- 多通道（multi）\n- 音频段独立（individual）\n- 允许重叠（overlap）\n- 全部需要翻译\n\n【说话人】\n- person1\n- person2\n\n【质检分类】\n- Wrong speaker\n- Wrong category\n- Wrong attribute',
    pageCount: 0,
  },
  POINT_CLOUD_SEMANTIC_SEGMENTATION: {
    description:
      '文档定义了点云语义分割标注规范：使用涂色（POINTS paint）方式区分点云场景中不同语义的物体，类别包括 pavement（路面）、vegetation（植被）、noise（噪声）、vehicle（车辆）、ego（自车）。每个类别使用 POINTS 工具，默认创建方式为 paint；配置 3D 帧属性（单选 1/2）与 2D 帧属性（单选 1/2）；80m 圆形边界、地面点云优先视角、逐点属性检查；质检分类包括 Redundant point(s)、Missed point(s)、Wrong category、Wrong attribute。',
    rawText:
      '【标注方式】\n- 使用涂色点云区分不同语义物体\n- 工具：POINTS，默认创建方式 paint\n\n【类别】\n- pavement（路面）\n- vegetation（植被）\n- noise（噪声）\n- vehicle（车辆）\n- ego（自车）\n\n【帧属性】\n- 3D 帧属性：单选 1/2\n- 2D 帧属性：单选 1/2\n\n【边界】\n- 80m 圆形边界\n\n【质检分类】\n- Redundant point(s)\n- Missed point(s)\n- Wrong category\n- Wrong attribute',
    pageCount: 14,
  },
  POINT_CLOUD_STATIC_OBSTACLE: {
    description:
      '文档定义了点云静态障碍物标注规范：在合并帧数据中标注静止障碍物、车道线、路面标识等。类别包括 drivable_surface（可行驶区域，3D 多边形）、line（车道线，3D 折线并手动投影 2D 线）、pavement（路面，3D 多边形并自动投影 2D 多边形）、traffic_light（交通灯，3D 立体框并自动投影 2D 矩形）；配置 3D 帧属性与 2D 帧属性；质检分类包括 Redundant object、Missed object、Wrong category、Wrong attribute、Not fit。',
    rawText:
      '【标注方式】\n- 在合并帧数据中标注静止障碍物、车道线、路面标识\n\n【类别】\n- drivable_surface：POLYGON3\n- line：POLYLINE3 + 2D 投影线\n- pavement：POLYGON3 + 2D 自动投影多边形\n- traffic_light：CUBE + 2D 自动投影矩形\n\n【帧属性】\n- 3D 帧属性：单选 1/2\n- 2D 帧属性：单选 1/2\n\n【质检分类】\n- Redundant object\n- Missed object\n- Wrong category\n- Wrong attribute\n- Not fit',
    pageCount: 16,
  },
  POINT_CLOUD_DYNAMIC_OBSTACLE: {
    description:
      '文档定义了点云动态障碍物标注规范：使用立体框（CUBE）标注动/静态目标物，并通过投影或手动创建的方式在相机中绘制 2D 图形。类别包括 car（小汽车，带物体静态属性与物体动态属性，2D 投影矩形）、bicycle（自行车）、motorcycle（摩托车）；立体框默认创建方式为 drag，支持跨帧阈值与可见性校验；配置 3D 帧属性与 2D 帧属性；质检分类包括 Redundant object、Missed object、Wrong category、Wrong attribute、Not fit。',
    rawText:
      '【标注方式】\n- 使用立体框（CUBE）标注动/静态目标物\n- 通过投影或手动创建在相机中绘制 2D 图形\n\n【类别】\n- car：CUBE + 2D 投影矩形\n- bicycle：CUBE + 2D 投影矩形\n- motorcycle：CUBE + 2D 投影矩形\n\n【属性】\n- 物体静态属性（单选 1/2）\n- 物体动态属性（单选 1/2）\n- 3D 子层动态属性：visible / invisible\n\n【帧属性】\n- 3D 帧属性：单选 1/2\n- 2D 帧属性：单选 1/2\n\n【质检分类】\n- Redundant object\n- Missed object\n- Wrong category\n- Wrong attribute\n- Not fit',
    pageCount: 12,
  },
};

