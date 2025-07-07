'use client';

import { Box, Stack } from '@mui/material';

import {
  ConnectionPanel,
  InformationChat,
  SavePackage,
  SelectedPackage,
} from '@/widgets/index';

export default function MainPage() {
  return (
    <Stack
      sx={{
        width: '1024px',
        height: '90vh',
        margin: '0 auto',
      }}
    >
      <Stack direction="row" sx={{ height: '90%' }}>
        <Box
          sx={{
            width: '25%',
            border: '1px solid black',
          }}
        >
          <SavePackage />
        </Box>
        <Box sx={{ width: '50%', border: '1px solid black' }}>
          <SelectedPackage />
        </Box>
        <Box sx={{ width: '25%', border: '1px solid black' }}>
          <InformationChat />
        </Box>
      </Stack>
      <Box sx={{ height: '10%', border: '1px solid black' }}>
        <ConnectionPanel />
      </Box>
    </Stack>
  );
}
