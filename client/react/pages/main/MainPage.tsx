'use client';

import { Box } from '@mui/material';

import {
  ConnectionPanel,
  InformationChat,
  SavePackage,
  SelectedPackage,
} from '@/widgets/index';

import { ContentContainer } from '@/shared/ui';

import { useStyles } from './style';

export default function MainPage() {
  const { classes } = useStyles();

  return (
    <ContentContainer>
      <Box className={classes.container}>
        <SavePackage className={classes.savePackage_area} />
        <SelectedPackage className={classes.selectedPackage_area} />
        <InformationChat className={classes.informationChat_area} />
        <ConnectionPanel className={classes.connectionPanel_area} />
      </Box>
    </ContentContainer>
  );
}
