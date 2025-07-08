'use client';

import { Box } from '@mui/material';

import {
  ConnectionPanel,
  InformationChat,
  SavePackage,
  SelectedPackage,
} from '@/widgets/index';

import ContentContainer from '@/shared/ui/contentContainer/ContentContainer';

import { useStyles } from './style';

export default function MainPage() {
  const { classes } = useStyles();

  return (
    <ContentContainer>
      <Box className={classes.container}>
        <SavePackage classes={classes.savePackage_area} />
        <SelectedPackage classes={classes.selectedPackage_area} />
        <InformationChat classes={classes.informationChat_area} />
        <ConnectionPanel classes={classes.connectionPanel_area} />
      </Box>
    </ContentContainer>
  );
}
