import type { RobotLayout } from '../types';

export const DEFAULT_ROBOT_LAYOUT: RobotLayout = {
  body: {
    width: 150.0,
    length: 180.0,
    width_front_rear: 130.0,
    width_middle: 150.0,
    axis_distance_longitudinal: 90.0,
    vertices: [
      { x: 75.0, y: 0.0 },     // Right Middle
      { x: 65.0, y: 90.0 },    // Right Rear
      { x: -65.0, y: 90.0 },   // Left Rear
      { x: -75.0, y: 0.0 },    // Left Middle
      { x: -65.0, y: -90.0 },  // Left Front
      { x: 65.0, y: -90.0 }    // Right Front
    ]
  },
  legs: {
    right_middle: {
      mount_point: { x: 75.0, y: 0.0 },
      base_angle: 0.0,
      coxa: { name: 'right_middle_coxa', length: 60.0, channel: 6 },
      femur: { name: 'right_middle_femur', length: 100.0, channel: 7 },
      tibia: { name: 'right_middle_tibia', length: 130.0, channel: 8 }
    },
    right_rear: {
      mount_point: { x: 65.0, y: 90.0 },
      base_angle: 0.7853981633974483,
      coxa: { name: 'right_rear_coxa', length: 60.0, channel: 3 },
      femur: { name: 'right_rear_femur', length: 100.0, channel: 4 },
      tibia: { name: 'right_rear_tibia', length: 130.0, channel: 5 }
    },
    left_rear: {
      mount_point: { x: -65.0, y: 90.0 },
      base_angle: 2.356194490192345,
      coxa: { name: 'left_rear_coxa', length: 60.0, channel: 9 },
      femur: { name: 'left_rear_femur', length: 100.0, channel: 10 },
      tibia: { name: 'left_rear_tibia', length: 130.0, channel: 11 }
    },
    left_middle: {
      mount_point: { x: -75.0, y: 0.0 },
      base_angle: 3.141592653589793,
      coxa: { name: 'left_middle_coxa', length: 60.0, channel: 12 },
      femur: { name: 'left_middle_femur', length: 100.0, channel: 13 },
      tibia: { name: 'left_middle_tibia', length: 130.0, channel: 14 }
    },
    left_front: {
      mount_point: { x: -65.0, y: -90.0 },
      base_angle: 3.9269908169872414,
      coxa: { name: 'left_front_coxa', length: 60.0, channel: 15 },
      femur: { name: 'left_front_femur', length: 100.0, channel: 16 },
      tibia: { name: 'left_front_tibia', length: 130.0, channel: 17 }
    },
    right_front: {
      mount_point: { x: 65.0, y: -90.0 },
      base_angle: 5.497787143782138,
      coxa: { name: 'right_front_coxa', length: 60.0, channel: 0 },
      femur: { name: 'right_front_femur', length: 100.0, channel: 1 },
      tibia: { name: 'right_front_tibia', length: 130.0, channel: 2 }
    }
  }
};

export const LEG_DISPLAY_MAP: Record<string, { label: string; code: string }> = {
  left_front: { label: 'Left Front', code: 'LF' },
  left_middle: { label: 'Left Middle', code: 'LM' },
  left_rear: { label: 'Left Rear', code: 'LR' },
  right_front: { label: 'Right Front', code: 'RF' },
  right_middle: { label: 'Right Middle', code: 'RM' },
  right_rear: { label: 'Right Rear', code: 'RR' }
};
